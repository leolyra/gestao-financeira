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
EXCLUDED_TYPES = ("opções", "derivativos", "futuros", "estruturados")
STRUCTURED_TERMS = ("CRA", "CRI", "DEBENTURE", "SUBSCR", "RECIBO")

TOOLS = [
 {"name":"portfolio_assets","description":"Lista ativos. Exclui por padrão opções, futuros, estruturados e tickers terminados em 12 ou 13.","inputSchema":{"type":"object","properties":{"include_excluded":{"type":"boolean","default":False},"ticker":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":200,"default":100}}}},
 {"name":"portfolio_transactions","description":"Consulta movimentações do usuário autenticado. Exclui por padrão snapshots de custódia e instrumentos fora do escopo.","inputSchema":{"type":"object","properties":{"ticker":{"type":"string"},"source":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":200,"default":100},"include_excluded":{"type":"boolean","default":False}}}},
 {"name":"propose_asset_classification","description":"Prepara uma alteração de classificação sem gravar. Solicite aprovação explícita do usuário.","inputSchema":{"type":"object","properties":{"ticker":{"type":"string"},"asset_type":{"type":"string","enum":sorted(ASSET_CLASSES)}},"required":["ticker","asset_type"]}},
 {"name":"apply_asset_classification","description":"Aplica a classificação somente com approved=true, após aprovação explícita do usuário na conversa.","inputSchema":{"type":"object","properties":{"ticker":{"type":"string"},"asset_type":{"type":"string","enum":sorted(ASSET_CLASSES)},"approved":{"type":"boolean"}},"required":["ticker","asset_type","approved"]}}
]

def is_excluded(ticker, asset_type, name):
 t=(ticker or "").upper(); typ=(asset_type or "").casefold(); nm=(name or "").upper()
 return (t.endswith(("12","13")) or re.match(r"^[A-Z]{4}[A-Z]\\d{2,3}$", t) is not None or re.match(r"^(WIN|WDO|IND|DOL)[A-Z0-9]*$", t) is not None or any(x in typ for x in EXCLUDED_TYPES) or any(x in nm for x in STRUCTURED_TERMS))

def tool_result(data):
 return {"content":[{"type":"text","text":json.dumps(data,ensure_ascii=False,default=str)}]}

def tool_error(message):
 return {"content":[{"type":"text","text":message}],"isError":True}

def call_tool(name,args,db,user):
 limit=max(1,min(int(args.get("limit",100)),200))
 if name=="portfolio_assets":
  q=db.query(Asset).order_by(Asset.ticker_current.asc())
  if args.get("ticker"): q=q.filter(Asset.ticker_current==args["ticker"].strip().upper())
  rows=q.limit(500).all()
  if not args.get("include_excluded",False): rows=[a for a in rows if not is_excluded(a.ticker_current,a.asset_type,a.name)]
  return tool_result([{"id":a.id,"ticker":a.ticker_current,"name":a.name,"asset_type":a.asset_type} for a in rows[:limit]])
 if name=="portfolio_transactions":
  q=db.query(InvestmentTransaction,Asset).join(Asset,InvestmentTransaction.asset_id==Asset.id).filter(InvestmentTransaction.user_id==user.id)
  if args.get("ticker"): q=q.filter(Asset.ticker_current==args["ticker"].strip().upper())
  if args.get("source"): q=q.filter(InvestmentTransaction.source==args["source"])
  rows=q.order_by(InvestmentTransaction.trade_date.desc(),InvestmentTransaction.id.desc()).limit(1000).all()
  result=[]
  for tx,a in rows:
   if not args.get("include_excluded",False) and (tx.source=="spreadsheet_custodia" or is_excluded(a.ticker_current,a.asset_type,a.name)): continue
   result.append({"id":tx.id,"ticker":a.ticker_current,"operation_type":tx.operation_type,"quantity":tx.quantity,"unit_price":tx.unit_price,"total_amount":tx.total_amount,"trade_date":tx.trade_date,"source":tx.source,"notes":tx.notes})
   if len(result)>=limit: break
  return tool_result(result)
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
