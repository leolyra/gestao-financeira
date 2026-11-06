from datetime import datetime
from decimal import Decimal
from typing import Iterable

def calculate_realized_gain(operations: Iterable, period_start: datetime) -> Decimal:
    """Replays trades using weighted-average cost; malformed oversells are prorated."""
    quantities, costs_by_asset = {}, {}
    realized = Decimal("0.00")
    ordered = sorted(operations, key=lambda op: (op.trade_date, op.id or 0))
    for op in ordered:
        kind=(op.operation_type or "").lower().strip()
        if kind not in {"buy","compra","sell","venda"}: continue
        aid=op.asset_id
        qty=Decimal(str(op.quantity or 0))
        amount=Decimal(str(op.total_amount or 0))
        costs=Decimal(str(op.costs or 0))
        held=quantities.get(aid,Decimal("0"))
        basis_total=costs_by_asset.get(aid,Decimal("0"))
        if kind in {"buy","compra"}:
            if qty<=0: continue
            quantities[aid]=held+qty
            costs_by_asset[aid]=basis_total+amount+costs
        elif qty>0 and held>0:
            sold=min(qty,held)
            ratio=sold/qty
            basis=(basis_total/held)*sold
            proceeds=(amount-costs)*ratio
            if op.trade_date>=period_start: realized+=proceeds-basis
            quantities[aid]=held-sold
            costs_by_asset[aid]=max(Decimal("0"),basis_total-basis)
    return realized
