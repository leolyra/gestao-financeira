"""MCP Streamable HTTP endpoint using the existing Finance API JWT authentication.
No arbitrary SQL is exposed. Mutations are disabled by default and must be explicitly enabled.
"""
import json
import logging
import re
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.entities import (Asset, InvestmentTransaction, User, MCPAuditLog, Account, Transaction, Category, AssetQuote)

logger = logging.getLogger("finance_api.mcp")
router = APIRouter(tags=["mcp"])
PROTOCOL_VERSION = "2025-03-26"
ASSET_CLASSES = {"Ações", "Fundos Imobiliários", "Internacional", "Renda Fixa", "Criptos", "ETF", "BDR", "Fundos de investimento", "Tesouro Direto"}
EXCLUDED_TYPES = ("opções", "opcao", "derivativos", "futuros", "estruturados")
STRUCTURED_TERMS = ("CRA", "CRI", "DEBENTURE", "DEBÊNTURE", "SUBSCR", "RECIBO", "COE", "TERMO", "SWAP", "WARRANT", "OPÇÃO", "OPCAO", "CALL", "PUT", "FUTURO", "OPÇÕES", "OPCOES")
EXCLUDED_TICKERS = {"BOVAK20", "BOVAW20", "BRTRXFD11M10", "BRXPMLD14M18", "BRHGRUD05M14", "BRRECRD06M15", "BRRECRD07M14", "BBDC1"}
ASSET_TYPE_OVERRIDES = {"TAEE11": "Ações", "COIN11": "Criptos", "HODL11": "Criptos", "QBTC11": "Criptos", "QETH11": "Criptos", "IVVB11": "Internacional", "JPMC34": "BDR"}
TICKER_ALIASES = {"JPMC3": "JPMC34"}
ALLOWED_ASSET_TYPES = {"ações", "fundos imobiliários", "internacional", "renda fixa", "criptos", "etf", "bdr", "fundos de investimento", "tesouro direto"}

WRITE_TOOL_NAMES = {"apply_asset_classification"}

TOOLS = [

 {"name":"financial_accounts","description":"Lista contas bancárias e cartões do usuário autenticado com os saldos atuais informados pela instituição ou pelos lançamentos manuais. Somente leitura.","inputSchema":{"type":"object","properties":{}}},
 {"name":"financial_cash_flow","description":"Resume receitas e despesas contabilizadas por mês, usando valores positivos como receitas e negativos como despesas. Datas opcionais no formato YYYY-MM-DD.","inputSchema":{"type":"object","properties":{"start_date":{"type":"string","description":"Data inicial inclusiva YYYY-MM-DD"},"end_date":{"type":"string","description":"Data final inclusiva YYYY-MM-DD"}}}},
 {"name":"financial_expenses_by_category","description":"Agrupa despesas contabilizadas por categoria no período. Considera somente transações negativas e contas do usuário autenticado. Datas opcionais no formato YYYY-MM-DD.","inputSchema":{"type":"object","properties":{"start_date":{"type":"string","description":"Data inicial inclusiva YYYY-MM-DD"},"end_date":{"type":"string","description":"Data final inclusiva YYYY-MM-DD"},"limit":{"type":"integer","minimum":1,"maximum":100,"default":50}}}},
 {"name":"investment_positions","description":"Lista posições consolidadas da carteira do usuário, com quantidade, custo investido e última cotação disponível quando houver. Somente leitura.","inputSchema":{"type":"object","properties":{}}},
 {"name":"investment_income","description":"Consulta dividendos, juros sobre capital próprio e rendimentos registrados para o usuário, com filtro opcional por período e ticker.","inputSchema":{"type":"object","properties":{"start_date":{"type":"string","description":"Data inicial inclusiva YYYY-MM-DD"},"end_date":{"type":"string","description":"Data final inclusiva YYYY-MM-DD"},"ticker":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":200,"default":100}}}},
 {"name":"portfolio_assets","description":"Lista somente ativos dentro do escopo. Exclui sempre opções, futuros, estruturas, instrumentos ambíguos e tickers terminados em 12 ou 13; não há parâmetro para reintroduzir itens excluídos.","inputSchema":{"type":"object","properties":{"ticker":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":200,"default":100}}}},
 {"name":"portfolio_transactions","description":"Consulta movimentações financeiras válidas do usuário autenticado. Exclui snapshots, valores zerados e instrumentos fora do escopo.","inputSchema":{"type":"object","properties":{"ticker":{"type":"string"},"source":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":200,"default":100}}}},
 {"name":"portfolio_pending_reconciliation","description":"Lista pendências em formato estruturado, pronto para planilha. Cada linha inclui opções de decisão (manter, excluir, corrigir), campos de decisão ainda vazios e sugestão; não altera dados.","inputSchema":{"type":"object","properties":{"limit":{"type":"integer","minimum":1,"maximum":200,"default":100}}}},
 {"name":"propose_asset_classification","description":"Prepara uma alteração de classificação sem gravar. Solicite aprovação explícita do usuário.","inputSchema":{"type":"object","properties":{"ticker":{"type":"string"},"asset_type":{"type":"string","enum":sorted(ASSET_CLASSES)}},"required":["ticker","asset_type"]}},
 {"name":"apply_asset_classification","description":"Aplica a classificação somente quando a escrita estiver habilitada e approved=true após aprovação explícita do usuário.","inputSchema":{"type":"object","properties":{"ticker":{"type":"string"},"asset_type":{"type":"string","enum":sorted(ASSET_CLASSES)},"approved":{"type":"boolean"}},"required":["ticker","asset_type","approved"]}}
]

def available_tools():
    """Expose write-capable tools only when the deployment explicitly opts in."""
    return [tool for tool in TOOLS if settings.MCP_ENABLE_WRITES or tool["name"] not in WRITE_TOOL_NAMES]

def is_excluded(ticker, asset_type, name):
 t=(ticker or "").strip().upper()
 typ=(asset_type or "").strip().casefold()
 nm=(name or "").strip().upper()
 if t in EXCLUDED_TICKERS or any(code in nm for code in EXCLUDED_TICKERS) or t.endswith(("12", "13")):
  return True
 if re.match(r"^(WIN|WDO|IND|DOL)[A-Z0-9]*$", t):
  return True
 if re.match(r"^[A-Z]{5}[A-Z]?\d{1,3}$", t):
  return True
 if typ not in ALLOWED_ASSET_TYPES:
  return True
 if any(x in typ for x in EXCLUDED_TYPES):
  return True
 if any(x in nm for x in STRUCTURED_TERMS):
  return True
 if typ == "ações" and (re.search(r"\b(FIM|FIC|FIRF|FIF|FICFIM)\b", nm) or re.fullmatch(r"\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}", t)):
  return True
 if not t:
  return True
 return False

def effective_asset_type(ticker, stored_asset_type):
 canonical_ticker=TICKER_ALIASES.get((ticker or "").strip().upper(),(ticker or "").strip().upper())
 if canonical_ticker in ASSET_TYPE_OVERRIDES:
  return ASSET_TYPE_OVERRIDES[canonical_ticker]
 if (ticker or "").strip().upper() in TICKER_ALIASES:
  return "BDR"
 return stored_asset_type


def reconciliation_reasons(tx, asset):
 reasons=[]
 if float(tx.total_amount or 0)<=0:
  reasons.append("valor_total_zerado")
 if not (asset.ticker_current or "").strip():
  reasons.append("ativo_sem_ticker")
 asset_name=(asset.name or "").strip().upper()
 ticker=(asset.ticker_current or "").strip().upper()
 is_itau_cdb="CDB" in asset_name and "ITAU" in asset_name
 # Itaú CDBs with an individual ticker are valid regardless of quantity or
 # the Pluggy unit-price representation (which can legitimately be R$ 0.01).
 generic_tickers={"", "CDB - ITAU UNIBANCO", "CDB-ITAU UNIBANCO"}
 has_individual_ticker=bool(ticker) and ticker not in generic_tickers and not ticker.startswith("CDB - ITAU")
 is_known_itau_cdb=is_itau_cdb and has_individual_ticker
 if "CDB" in asset_name and not is_known_itau_cdb:
  reasons.append("CDB_generico_sem_identificador")
 return reasons

def tool_result(data):
 return {"content":[{"type":"text","text":json.dumps(data,ensure_ascii=False,default=str)}]}

def tool_error(message):
 return {"content":[{"type":"text","text":message}],"isError":True}

def call_tool(name,args,db,user):
 if name in WRITE_TOOL_NAMES and not settings.MCP_ENABLE_WRITES:
  return tool_error("Modo somente leitura: esta ferramenta de escrita está desabilitada neste ambiente.")
 limit=max(1,min(int(args.get("limit",100)),200))

 if name in ("financial_cash_flow","financial_expenses_by_category","investment_income"):
  def parse_bound(value, end=False):
   if not value: return None
   try:
    parsed=datetime.fromisoformat(str(value))
    return parsed.replace(hour=23,minute=59,second=59, microsecond=999999) if end and len(str(value))==10 else parsed
   except (TypeError,ValueError):
    raise ValueError("Data inválida. Use o formato YYYY-MM-DD.")
  start=parse_bound(args.get("start_date"))
  end=parse_bound(args.get("end_date"),True)
  if start and end and start>end: return tool_error("Período inválido: start_date deve ser anterior ou igual a end_date.")
  if name=="financial_cash_flow":
   q=db.query(Transaction).join(Account,Transaction.account_id==Account.id).filter(Account.user_id==user.id,Transaction.is_accounted.is_(True))
   if start: q=q.filter(Transaction.date>=start)
   if end: q=q.filter(Transaction.date<=end)
   monthly={}
   for tx in q.order_by(Transaction.date.asc()).all():
    key=tx.date.strftime("%Y-%m")
    row=monthly.setdefault(key,{"month":key,"income":0.0,"expenses":0.0,"net":0.0,"transactions":0})
    amount=float(tx.amount or 0)
    if amount>0: row["income"]+=amount
    elif amount<0: row["expenses"]+=abs(amount)
    row["net"]+=amount; row["transactions"]+=1
   return tool_result(sorted(monthly.values(),key=lambda x:x["month"]))
  if name=="financial_expenses_by_category":
   q=db.query(Transaction,Category.name).join(Account,Transaction.account_id==Account.id).outerjoin(Category,Transaction.category_id==Category.id).filter(Account.user_id==user.id,Transaction.is_accounted.is_(True),Transaction.amount<0)
   if start: q=q.filter(Transaction.date>=start)
   if end: q=q.filter(Transaction.date<=end)
   groups={}
   for tx,category_name in q.all():
    key=category_name or "Sem categoria"
    row=groups.setdefault(key,{"category":key,"total":0.0,"transactions":0})
    row["total"]+=abs(float(tx.amount or 0));row["transactions"]+=1
   return tool_result(sorted(groups.values(),key=lambda x:x["total"],reverse=True)[:limit])
  q=db.query(InvestmentTransaction,Asset.ticker_current,Asset.name).join(Asset,InvestmentTransaction.asset_id==Asset.id).filter(InvestmentTransaction.user_id==user.id,InvestmentTransaction.operation_type.in_(["dividend","jcp","rendimento"]))
  if args.get("ticker"): q=q.filter(Asset.ticker_current==args["ticker"].strip().upper())
  if start: q=q.filter(InvestmentTransaction.trade_date>=start)
  if end: q=q.filter(InvestmentTransaction.trade_date<=end)
  rows=q.order_by(InvestmentTransaction.trade_date.desc(),InvestmentTransaction.id.desc()).limit(limit).all()
  return tool_result([{"ticker":ticker,"asset_name":asset_name,"type":tx.operation_type,"amount":abs(float(tx.total_amount or 0)),"date":tx.trade_date,"source":tx.source,"notes":tx.notes} for tx,ticker,asset_name in rows])
 if name=="financial_accounts":
  rows=db.query(Account).filter(Account.user_id==user.id).order_by(Account.name.asc()).all()
  return tool_result([{"id":a.id,"name":a.name,"type":a.type,"balance":float(a.balance or 0)} for a in rows])
 if name=="investment_positions":
  from app.api.endpoints.investments import get_portfolio
  positions=get_portfolio(db,user)
  quotes=db.query(AssetQuote).filter(AssetQuote.user_id==user.id).order_by(AssetQuote.quoted_at.desc()).all()
  latest={}
  for quote in quotes:
   if quote.asset_id not in latest: latest[quote.asset_id]=quote
  result=[]
  for p in positions:
   quote=latest.get(p.asset_id)
   quantity=float(quote.quantity if quote and quote.quantity is not None else p.quantity)
   price=float(quote.price) if quote else None
   result.append({"ticker":p.ticker,"name":p.name,"asset_type":p.asset_type,"quantity":float(p.quantity),
    "average_price":float(p.average_price),"cost_basis":float(p.total_invested),
    "latest_price":price,"market_value":quantity*price if price is not None else None,
    "quote_date":quote.quoted_at if quote else None,"total_dividends":float(p.total_dividends)})
  return tool_result(result)
 if name=="portfolio_assets":
  q=db.query(Asset).order_by(Asset.ticker_current.asc())
  if args.get("ticker"):
   requested=args["ticker"].strip().upper()
   stored=next((k for k,v in TICKER_ALIASES.items() if v==requested),requested)
   q=q.filter(Asset.ticker_current==stored)
  rows=q.limit(500).all()
  raw_tickers={str(a.ticker_current or "").strip().upper() for a in rows}
  rows=[a for a in rows if not is_excluded(a.ticker_current,a.asset_type,a.name)]
  result=[]; seen=set()
  for a in rows:
   ticker=TICKER_ALIASES.get(a.ticker_current,a.ticker_current)
   if ticker in seen: continue
   if a.ticker_current in TICKER_ALIASES and ticker in raw_tickers: continue
   seen.add(ticker)
   result.append({"id":a.id,"ticker":ticker,"name":("JPMorgan Chase BDR (JPMC34)" if a.ticker_current=="JPMC3" else a.name),"asset_type":ASSET_TYPE_OVERRIDES.get(ticker,("BDR" if a.ticker_current=="JPMC3" else a.asset_type))})
  return tool_result(result[:limit])
 if name=="portfolio_transactions":
  q=db.query(InvestmentTransaction,Asset).join(Asset,InvestmentTransaction.asset_id==Asset.id).filter(InvestmentTransaction.user_id==user.id)
  if args.get("ticker"):
   requested=args["ticker"].strip().upper()
   stored=next((k for k,v in TICKER_ALIASES.items() if v==requested),requested)
   q=q.filter(Asset.ticker_current==stored)
  if args.get("source"): q=q.filter(InvestmentTransaction.source==args["source"])
  rows=q.order_by(InvestmentTransaction.trade_date.desc(),InvestmentTransaction.id.desc()).limit(1000).all()
  result=[]
  for tx,a in rows:
   if tx.source=="spreadsheet_custodia" or is_excluded(a.ticker_current,a.asset_type,a.name) or reconciliation_reasons(tx,a): continue
   result.append({"id":tx.id,"ticker":TICKER_ALIASES.get(a.ticker_current,a.ticker_current),"asset_type":effective_asset_type(a.ticker_current,a.asset_type),"operation_type":tx.operation_type,"quantity":tx.quantity,"unit_price":tx.unit_price,"total_amount":tx.total_amount,"trade_date":tx.trade_date,"source":tx.source,"notes":tx.notes})
   if len(result)>=limit: break
  return tool_result(result)
 if name=="portfolio_pending_reconciliation":
  # Stream the complete ordered result set. Applying LIMIT before checking
  # reconciliation reasons can hide older pending items behind valid rows.
  rows=(db.query(InvestmentTransaction,Asset).join(Asset,InvestmentTransaction.asset_id==Asset.id).filter(InvestmentTransaction.user_id==user.id).filter(InvestmentTransaction.source!="spreadsheet_custodia").order_by(InvestmentTransaction.trade_date.desc(),InvestmentTransaction.id.desc()).yield_per(250))
  pending=[]
  for tx,a in rows:
   reasons=reconciliation_reasons(tx,a)
   if reasons: pending.append({"item_id":f"transaction:{tx.id}","id":tx.id,"ticker":a.ticker_current,"asset_name":a.name,"current_asset_type":a.asset_type,"operation_type":tx.operation_type,"quantity":tx.quantity,"unit_price":tx.unit_price,"total_amount":tx.total_amount,"trade_date":tx.trade_date,"source":tx.source,"reconciliation_reasons":reasons,"suggested_action":"REVISAR","suggested_asset_type":effective_asset_type(a.ticker_current,a.asset_type),"user_decision":None,"new_asset_type":None,"decision_options":["manter","excluir","corrigir"],"notes":tx.notes})
   if len(pending)>=limit: break
  return tool_result(pending)
 if name in ("propose_asset_classification","apply_asset_classification"):
  ticker=str(args.get("ticker","")).strip().upper(); new_type=str(args.get("asset_type","")).strip()
  if not ticker or new_type not in ASSET_CLASSES: return tool_error("Ticker ou classificação inválida.")
  asset=db.query(Asset).filter(Asset.ticker_current==ticker).with_for_update().first() if name=="apply_asset_classification" else db.query(Asset).filter(Asset.ticker_current==ticker).first()
  if not asset: return tool_error("Ativo não encontrado.")
  if is_excluded(asset.ticker_current,asset.asset_type,asset.name): return tool_error("Ativo fora do escopo definido pelo usuário; nenhuma alteração permitida.")
  forced_type=ASSET_TYPE_OVERRIDES.get(ticker)
  if forced_type and new_type!=forced_type: return tool_error(f"Classificação definida pelo usuário para {ticker}: {forced_type}.")
  old=asset.asset_type
  if name=="propose_asset_classification":
   return tool_result({"status":"approval_required","ticker":ticker,"asset_id":asset.id,"current_asset_type":old,"proposed_asset_type":new_type,"message":"Nenhuma alteração foi realizada. Após aprovação explícita, chame apply_asset_classification com approved=true."})
  if args.get("approved") is not True: return tool_error("Bloqueado: approved=true é obrigatório após aprovação explícita do usuário.")
  if old==new_type: return tool_result({"status":"no_change","ticker":ticker,"asset_type":old})
  asset.asset_type=new_type
  db.add(MCPAuditLog(user_id=user.id,action="asset_classification_update",entity_type="assets",entity_id=str(asset.id),before_json=json.dumps({"ticker":ticker,"asset_type":old},ensure_ascii=False),after_json=json.dumps({"ticker":ticker,"asset_type":new_type},ensure_ascii=False),created_at=datetime.now(timezone.utc)))
  db.commit()
  return tool_result({"status":"updated","ticker":ticker,"previous_asset_type":old,"asset_type":new_type})
 return tool_error("Ferramenta desconhecida: "+name)

@router.post("/mcp")
async def mcp_endpoint(request:Request,db:Session=Depends(get_db),current_user:User=Depends(get_current_user)):
 try: body=await request.json()
 except Exception: return JSONResponse({"jsonrpc":"2.0","error":{"code":-32700,"message":"Invalid JSON"},"id":None},status_code=400)
 if not isinstance(body,dict) or body.get("jsonrpc")!="2.0" or "method" not in body:
  return JSONResponse({"jsonrpc":"2.0","error":{"code":-32600,"message":"Invalid Request"},"id":body.get("id") if isinstance(body,dict) else None},status_code=400)
 method=body["method"]; rid=body.get("id")
 if method.startswith("notifications/"): return JSONResponse({},status_code=202)
 if method=="initialize":
  return JSONResponse({"jsonrpc":"2.0","id":rid,"result":{"protocolVersion":PROTOCOL_VERSION,"capabilities":{"tools":{"listChanged":False}},"serverInfo":{"name":"gestao-financeira-mcp","version":"1.0.0"}}})
 if method=="ping": return JSONResponse({"jsonrpc":"2.0","id":rid,"result":{}})
 if method=="tools/list": return JSONResponse({"jsonrpc":"2.0","id":rid,"result":{"tools":available_tools()}})
 if method=="tools/call":
  p=body.get("params") or {}
  try: result=call_tool(p.get("name",""),p.get("arguments") or {},db,current_user)
  except Exception:
   db.rollback(); logger.exception("MCP tool execution failed"); result=tool_error("Falha interna ao executar ferramenta MCP.")
  return JSONResponse({"jsonrpc":"2.0","id":rid,"result":result})
 return JSONResponse({"jsonrpc":"2.0","id":rid,"error":{"code":-32601,"message":"Method not found"}})
