from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.entities import Account, Asset, AssetQuote, CreditCardBill, FinancialGoal, Transaction, User
from app.services.pluggy_service import pluggy_service
from app.api.endpoints.investments import get_portfolio

router = APIRouter(prefix="/financial-hub", tags=["financial-hub"])
ZERO = Decimal("0.00")

class GoalInput(BaseModel):
    name: str = Field(min_length=2, max_length=140)
    target_amount: Decimal = Field(gt=0)
    current_amount: Decimal = Field(default=ZERO, ge=0)
    target_date: Optional[datetime] = None
    category: Optional[str] = None

class QuoteInput(BaseModel):
    ticker: str
    price: Decimal = Field(gt=0)
    currency: str = "BRL"

def money(value):
    return Decimal(str(value or 0))

def latest_quotes(db, user_id):
    rows=db.query(AssetQuote).filter(AssetQuote.user_id==user_id).order_by(AssetQuote.quoted_at.desc()).all()
    result={}
    for row in rows:
        if row.asset_id not in result: result[row.asset_id]=row
    return result

@router.get("/net-worth")
def net_worth(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    accounts=db.query(Account).filter(Account.user_id==user.id).all()
    cash=sum((money(a.balance) for a in accounts if a.type!="credit_card"),ZERO)
    card_debt=sum((abs(money(a.balance)) for a in accounts if a.type=="credit_card" and money(a.balance)<0),ZERO)
    bills=db.query(CreditCardBill).filter(CreditCardBill.user_id==user.id, CreditCardBill.status.notin_(["PAID","CLOSED_PAID"])).all()
    bills_total=sum((max(ZERO,money(b.amount)-money(b.paid_amount)) for b in bills),ZERO)
    positions={p.asset_id:p for p in get_portfolio(db,user)}
    quotes=latest_quotes(db,user.id)
    market=ZERO; missing=[]
    for aid,p in positions.items():
        quote=quotes.get(aid)
        if quote:
            qty=money(quote.quantity) if quote.quantity is not None else money(p.quantity)
            market+=qty*money(quote.price)
        else: missing.append(p.ticker)
    for aid,q in quotes.items():
        if aid not in positions and q.quantity is not None:
            market+=money(q.quantity)*money(q.price)
    invested=sum((money(p.total_invested) for p in positions.values()),ZERO)
    liabilities=max(card_debt,bills_total)
    return {"cash_and_bank_accounts":cash,"investment_market_value":market,"investment_cost_basis":invested,
        "investment_unrealized_gain":market-invested,"credit_card_liabilities":liabilities,"open_bills":bills_total,
        "net_worth":cash+market-liabilities,"quote_missing":missing,"updated_at":datetime.utcnow().isoformat()}

@router.get("/investment-dashboard")
def investment_dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    positions={p.asset_id:p for p in get_portfolio(db,user)}
    quotes=latest_quotes(db,user.id)
    ids=set(positions)|set(quotes)
    rows=[]; by_class={}; total_cost=ZERO; total_market=ZERO
    for aid in ids:
        p=positions.get(aid); quote=quotes.get(aid)
        asset=db.query(Asset).filter(Asset.id==aid).first()
        qty=money(quote.quantity) if quote and quote.quantity is not None else (money(p.quantity) if p else ZERO)
        price=money(quote.price) if quote else ZERO
        market=qty*price if quote else ZERO
        cost=money(p.total_invested) if p else ZERO
        cls=p.asset_type if p else (asset.asset_type if asset else "Outros")
        ticker=p.ticker if p else (asset.ticker_current if asset else str(aid))
        total_cost+=cost; total_market+=market
        by_class[cls]=by_class.get(cls,ZERO)+market
        rows.append({"asset_id":aid,"ticker":ticker,"name":p.name if p else (asset.name if asset else ticker),
            "asset_type":cls,"quantity":qty,"average_price":p.average_price if p else ZERO,
            "cost_basis":cost,"current_price":price,"market_value":market,
            "unrealized_gain":market-cost if quote and p else None,
            "quote_date":quote.quoted_at.isoformat() if quote else None})
    return {"positions":rows,"total_cost_basis":total_cost,"total_market_value":total_market,
        "unrealized_gain":total_market-total_cost,"allocation_by_class":by_class}

@router.post("/quotes")
def add_quote(payload: QuoteInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    asset=db.query(Asset).filter(Asset.ticker_current==payload.ticker.upper().strip()).first()
    if not asset: raise HTTPException(status_code=404,detail="Ativo não encontrado.")
    quote=AssetQuote(user_id=user.id,asset_id=asset.id,price=payload.price,currency=payload.currency.upper(),source="manual")
    db.add(quote);db.commit();db.refresh(quote)
    return {"id":quote.id,"ticker":asset.ticker_current,"price":quote.price,"quoted_at":quote.quoted_at}

@router.post("/sync-bills")
async def sync_bills(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    accounts=db.query(Account).filter(Account.user_id==user.id,Account.type=="credit_card",Account.pluggy_account_id.isnot(None)).all()
    count=0
    def parse_date(value):
        if not value:return None
        try:return datetime.fromisoformat(str(value).replace("Z","+00:00")).replace(tzinfo=None)
        except Exception:return None
    for account in accounts:
        for item in await pluggy_service.get_bills(account.pluggy_account_id):
            ext=str(item.get("id") or "")
            if not ext:continue
            bill=db.query(CreditCardBill).filter(CreditCardBill.account_id==account.id,CreditCardBill.external_id==ext).first()
            values={"user_id":user.id,"account_id":account.id,"external_id":ext,
                "due_date":parse_date(item.get("dueDate")),"closing_date":parse_date(item.get("closingDate")),
                "amount":money(item.get("totalAmount") or item.get("amount")),
                "paid_amount":money(item.get("paidAmount")),"status":str(item.get("status") or ""),
                "currency":str(item.get("currencyCode") or "BRL")}
            if bill:
                for k,v in values.items():setattr(bill,k,v)
            else:db.add(CreditCardBill(**values))
            count+=1
    db.commit()
    return {"status":"success","bills_synced":count,"accounts_checked":len(accounts)}

@router.get("/goals")
def list_goals(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(FinancialGoal).filter(FinancialGoal.user_id==user.id).order_by(FinancialGoal.created_at.desc()).all()

@router.post("/goals")
def create_goal(payload: GoalInput, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    goal=FinancialGoal(user_id=user.id,**payload.model_dump());db.add(goal);db.commit();db.refresh(goal);return goal

@router.patch("/goals/{goal_id}")
def update_goal(goal_id:int,payload:GoalInput,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    goal=db.query(FinancialGoal).filter(FinancialGoal.id==goal_id,FinancialGoal.user_id==user.id).first()
    if not goal:raise HTTPException(status_code=404,detail="Meta não encontrada.")
    for k,v in payload.model_dump().items():setattr(goal,k,v)
    db.commit();db.refresh(goal);return goal

@router.delete("/goals/{goal_id}")
def delete_goal(goal_id:int,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    goal=db.query(FinancialGoal).filter(FinancialGoal.id==goal_id,FinancialGoal.user_id==user.id).first()
    if not goal:raise HTTPException(status_code=404,detail="Meta não encontrada.")
    db.delete(goal);db.commit();return {"deleted":True}

@router.get("/cash-flow-forecast")
def cash_flow_forecast(months:int=6,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    months=max(1,min(months,24));now=datetime.utcnow();since=now-timedelta(days=180)
    txs=db.query(Transaction).join(Account).filter(Account.user_id==user.id,Transaction.is_accounted==True,Transaction.date>=since).all()
    totals={}
    for i in range(6):
        month=(now.replace(day=1)-timedelta(days=30*i)).replace(day=1)
        totals[month.strftime("%Y-%m")]={"income":ZERO,"expenses":ZERO}
    for tx in txs:
        row=totals.get(tx.date.strftime("%Y-%m"))
        if row is not None:
            if money(tx.amount)>=0:row["income"]+=money(tx.amount)
            else:row["expenses"]+=abs(money(tx.amount))
    avg_income=sum((v["income"] for v in totals.values()),ZERO)/6
    avg_expenses=sum((v["expenses"] for v in totals.values()),ZERO)/6
    forecast=[]
    for offset in range(1,months+1):
        month=(now.replace(day=1)+timedelta(days=32*offset)).replace(day=1)
        forecast.append({"month":month.strftime("%Y-%m"),"projected_income":avg_income,
            "projected_expenses":avg_expenses,"projected_net":avg_income-avg_expenses})
    return {"historical_months":6,"average_monthly_income":avg_income,"average_monthly_expenses":avg_expenses,
        "average_monthly_surplus":avg_income-avg_expenses,"forecast":forecast,
        "method":"média dos últimos seis meses, incluindo meses sem lançamentos"}

@router.get("/calendar")
def financial_calendar(days:int=90,db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    until=datetime.utcnow()+timedelta(days=max(1,min(days,365)))
    bills=db.query(CreditCardBill).filter(CreditCardBill.user_id==user.id,CreditCardBill.due_date!=None,
        CreditCardBill.due_date<=until,CreditCardBill.status.notin_(["PAID","CLOSED_PAID"])).all()
    return [{"type":"credit_card_bill","date":b.due_date,"title":"Fatura do cartão",
        "amount":max(ZERO,money(b.amount)-money(b.paid_amount)),"account_id":b.account_id,"status":b.status} for b in bills]

@router.get("/insights")
def financial_insights(db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    since=datetime.utcnow()-timedelta(days=90)
    txs=db.query(Transaction).join(Account).filter(Account.user_id==user.id,Transaction.is_accounted==True,Transaction.date>=since).all()
    groups={}
    for tx in txs:
        key=(tx.account_id,(tx.description or "").strip().lower(),abs(money(tx.amount)))
        groups[key]=groups.get(key,0)+1
    possible=[{"account_id":k[0],"description":k[1],"amount":k[2],"occurrences":v} for k,v in groups.items() if v>1]
    monthly={}
    for tx in txs:
        if money(tx.amount)<0:
            key=tx.date.strftime("%Y-%m");monthly[key]=monthly.get(key,ZERO)+abs(money(tx.amount))
    current=datetime.utcnow().strftime("%Y-%m");current_expense=monthly.get(current,ZERO)
    previous=[v for k,v in monthly.items() if k!=current]
    avg=sum(previous,ZERO)/max(1,len(previous))
    insights=[]
    if avg>0 and current_expense>avg*Decimal("1.25"):
        insights.append({"type":"spending_spike","severity":"warning","message":"As despesas do mês atual estão mais de 25% acima da média dos meses anteriores."})
    if possible:insights.append({"type":"possible_duplicates","severity":"info","count":len(possible),"items":possible[:20]})
    return {"period_days":90,"insights":insights,"note":"Alertas heurísticos; confirme lançamentos repetidos antes de excluir."}

@router.get("/fire-simulator")
def fire_simulator(monthly_contribution:Decimal=Decimal("0"),annual_return_pct:Decimal=Decimal("6"),
    withdrawal_rate_pct:Decimal=Decimal("4"),db:Session=Depends(get_db),user:User=Depends(get_current_user)):
    since=datetime.utcnow()-timedelta(days=180)
    txs=db.query(Transaction).join(Account).filter(Account.user_id==user.id,Transaction.is_accounted==True,Transaction.date>=since).all()
    expenses=sum((abs(money(t.amount)) for t in txs if money(t.amount)<0),ZERO)/6
    income=sum((money(t.amount) for t in txs if money(t.amount)>0),ZERO)/6
    contribution=max(ZERO,monthly_contribution) if monthly_contribution>0 else max(ZERO,income-expenses)
    withdrawal=max(Decimal("0.1"),withdrawal_rate_pct)/100
    target=expenses*12/withdrawal
    positions={p.asset_id:p for p in get_portfolio(db,user)};quotes=latest_quotes(db,user.id)
    capital=sum((money(quotes[p.asset_id].price)*money(quotes[p.asset_id].quantity if quotes[p.asset_id].quantity is not None else p.quantity)
        for p in positions.values() if p.asset_id in quotes),ZERO)
    rate=(max(Decimal("-99"),annual_return_pct)/100+1)**(Decimal(1)/12)-1
    months=0
    while capital<target and months<1200 and contribution>0:
        capital=capital*(1+rate)+contribution;months+=1
    return {"average_monthly_expenses":expenses,"average_monthly_income":income,
        "monthly_contribution_assumed":contribution,"annual_return_pct":annual_return_pct,
        "withdrawal_rate_pct":withdrawal_rate_pct,"financial_independence_target":target,
        "starting_invested_capital":capital if months==0 else None,
        "projected_months":months if capital>=target else None,
        "projected_years":(Decimal(months)/12).quantize(Decimal("0.1")) if capital>=target else None,
        "projected_capital":capital,
        "assumptions":"Simulação nominal simplificada, sem impostos, inflação, volatilidade ou mudanças de renda/despesas."}
