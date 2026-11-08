"""MCP Streamable HTTP endpoint using the existing Finance API JWT authentication.
No arbitrary SQL is exposed. Mutations are typed, scoped, and require explicit approval.
"""
import json
import logging
import re
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.entities import Asset, InvestmentTransaction, User, MCPAuditLog

logger = logging.getLogger("finance_api.mcp")
router = APIRouter(tags=["mcp"])
PROTOCOL_VERSION = "2025-03-26"
ASSET_CLASSES = {"Ações", "Fundos Imobiliários", "Internacional", "Renda Fixa", "Criptos", "ETF", "BDR", "Fundos de investimento", "Tesouro Direto"}
EXCLUDED_TYPES = ("opções", "opcao", "derivativos", "futuros", "estruturados")
STRUCTURED_TERMS = ("CRA", "CRI", "DEBENTURE", "DEBÊNTURE", "SUBSCR", "RECIBO", "COE", "TERMO", "SWAP", "WARRANT", "OPÇÃO", "OPCAO", "CALL", "PUT", "FUTURO", "OPÇÕES", "OPCOES")
EXCLUDED_TICKERS = {"BOVAW20", "BRHGRUD05M14", "BRRECRD06M15", "BRRECRD07M14", "BBDC1"}
TICKER_ALIASES = {"JPMC3": "JPMC34"}
ALLOWED_ASSET_TYPES = {"ações", "fundos imobiliários", "internacional", "renda fixa", "criptos", "etf", "bdr", "fundos de investimento", "tesouro direto"}

TOOLS = [
 {"name":"portfolio_assets","description":"Lista somente ativos dentro do escopo. Exclui sempre opções, futuros, estruturas, instrumentos ambíguos e tickers terminados em 12 ou 13; não há parâmetro para reintroduzir itens excluídos.","inputSchema":{"type":"object","properties":{"ticker":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":200,"default":100}}}},
 {"name":"portfolio_transactions","description":"Consulta movimentações financeiras válidas do usuário autenticado. Exclui snapshots, valores zerados e instrumentos fora do escopo.","inputSchema":{"type":"object","properties":{"ticker":{"type":"string"},"source":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":200,"default":100}}}},
 {"name":"portfolio_pending_reconciliation","description":"Lista separadamente movimentações que exigem conciliação: valor total zerado, ativo sem ticker ou CDB genérico. Não são tratadas como operações financeiras válidas.","inputSchema":{"type":"object","properties":{"limit":{"type":"integer","minimum":1,"maximum":200,"default":100}}}},
 {"name":"propose_asset_classification","description":"Prepara uma alteração de classificação sem gravar. Solicite aprovação explícita do usuário.","inputSchema":{"type":"object","properties":{"ticker":{"type":"string"},"asset_type":{"type":"string","enum":sorted(ASSET_CLASSES)}},"required":["ticker","asset_type"]}},
 {"name":"apply_asset_classification","description":"Aplica a classificação somente com approved=true, após aprovação explícita do usuário na conversa.","inputSchema":{"type":"object","properties":{"ticker":{"type":"string"},"asset_type":{"type":"string","enum":sorted(ASSET_CLASSES)},"approved":{"type":"boolean"}},"required":["ticker","asset_type","approved"]}}
]

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

def tool_result(data):
 return {"content":[{"type":"text","text":json.dumps(data,ensure_ascii=False,default=str)}]}

def tool_error(message):
 return {"content":[{"type":"text","text":message}],"isError":True}

def call_tool(name,args,db,user):
 limit=max(1,min(int(args.get("limit",100)),200))
 if name=="portfolio_assets":
  q=db.query(Asset).order_by(Asset.ticker_current.asc())
  if args.get("ticker"):
   requested=args["ticker"].strip().upper()
   stored=next((k for k,v in TICKER_ALIASES.items() if v==requested),requested)
   q=q.filter(Asset.ticker_current==stored)
  rows=q.limit(500).all()
  rows=[a for a in rows if not is_excluded(a.ticker_current,a.asset_type,a.name)]
  return tool_result([{"id":a.id,"ticker":TICKER_ALIASES.get(a.ticker_current,a.ticker_current),"name":("JPMorgan Chase BDR (JPMC34)" if a.ticker_current=="JPMC3" else a.name),"asset_type":("BDR" if a.ticker_current=="JPMC3" else a.asset_type)} for a in rows[:limit]])
 if name=="portfolio_transactions":
  q=db.query(InvestmentTransaction,Asset).join(Asset,InvestmentTransaction.asset_id==Asset.id).filter(InvestmentTransaction.user_id==user.id)
  if args.get("ticker"): q=q.filter(Asset.ticker_current==args["ticker"].strip().upper())
  if args.get("source"): q=q.filter(InvestmentTransaction.source==args["source"])
  rows=q.order_by(InvestmentTransaction.trade_date.desc(),InvestmentTransaction.id.desc()).limit(1000).all()
  result=[]
  for tx,a in rows:
   if tx.source=="spreadsheet_custodia" or is_excluded(a.ticker_current,a.asset_type,a.name) or float(tx.total_amount or 0)<=0: continue
   result.append({"id":tx.id,"ticker":TICKER_ALIASES.get(a.ticker_current,a.ticker_current),"operation_type":tx.operation_type,"quantity":tx.quantity,"unit_price":tx.unit_price,"total_amount":tx.total_amount,"trade_date":tx.trade_date,"source":tx.source,"notes":tx.notes})
   if len(result)>=limit: break
  return tool_result(result)
 if name=="portfolio_pending_reconciliation":
  rows=(db.query(InvestmentTransaction,Asset).join(Asset,InvestmentTransaction.asset_id==Asset.id).filter(InvestmentTransaction.user_id==user.id).filter(InvestmentTransaction.source!="spreadsheet_custodia").order_by(InvestmentTransaction.trade_date.desc(),InvestmentTransaction.id.desc()).limit(1000).all())
  pending=[]
  for tx,a in rows:
   reasons=[]
   if float(tx.total_amount or 0)<=0: reasons.append("valor_total_zerado")
   if not (a.ticker_current or "").strip(): reasons.append("ativo_sem_ticker")
   if "CDB" in (a.name or "").upper(): reasons.append("CDB_generico_sem_identificador")
   if reasons: pending.append({"id":tx.id,"ticker":a.ticker_current,"asset_name":a.name,"operation_type":tx.operation_type,"quantity":tx.quantity,"unit_price":tx.unit_price,"total_amount":tx.total_amount,"trade_date":tx.trade_date,"source":tx.source,"reconciliation_reasons":reasons,"notes":tx.notes})
   if len(pending)>=limit: break
  return tool_result(pending)
 if name in ("propose_asset_classification","apply_asset_classification"):
  ticker=str(args.get("ticker","")).strip().upper(); new_type=str(args.get("asset_type","")).strip()
  if not ticker or new_type not in ASSET_CLASSES: return tool_error("Ticker ou classificação inválida.")
  asset=db.query(Asset).filter(Asset.ticker_current==ticker).with_for_update().first() if name=="apply_asset_classification" else db.query(Asset).filter(Asset.ticker_current==ticker).first()
  if not asset: return tool_error("Ativo não encontrado.")
  if is_excluded(asset.ticker_current,asset.asset_type,asset.name): return tool_error("Ativo fora do escopo definido pelo usuário; nenhuma alteração permitida.")
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
 if method=="tools/list": return JSONResponse({"jsonrpc":"2.0","id":rid,"result":{"tools":TOOLS}})
 if method=="tools/call":
  p=body.get("params") or {}
  try: result=call_tool(p.get("name",""),p.get("arguments") or {},db,current_user)
  except Exception:
   db.rollback(); logger.exception("MCP tool execution failed"); result=tool_error("Falha interna ao executar ferramenta MCP.")
  return JSONResponse({"jsonrpc":"2.0","id":rid,"result":result})
 return JSONResponse({"jsonrpc":"2.0","id":rid,"error":{"code":-32601,"message":"Method not found"}})
