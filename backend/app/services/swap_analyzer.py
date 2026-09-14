from decimal import Decimal
from typing import Dict, Any

def analyze_asset_swap(
    source_ticker: str,
    source_price: Decimal,
    source_yield_annual: Decimal,
    target_ticker: str,
    target_price: Decimal,
    target_yield_annual: Decimal,
    capital_amount: Decimal
) -> Dict[str, Any]:
    # Rendimentos atuais do ativo de origem
    source_shares = (capital_amount / source_price).quantize(Decimal("1"))
    source_annual_income = capital_amount * (source_yield_annual / Decimal("100"))
    source_monthly_income = source_annual_income / Decimal("12")

    # Rendimentos projetados no ativo de destino
    target_shares = (capital_amount / target_price).quantize(Decimal("1"))
    target_annual_income = capital_amount * (target_yield_annual / Decimal("100"))
    target_monthly_income = target_annual_income / Decimal("12")

    # Incremento financeiro
    monthly_gain = target_monthly_income - source_monthly_income
    annual_gain = target_annual_income - source_annual_income
    percentage_increase = Decimal("0.0")
    if source_monthly_income > 0:
        percentage_increase = ((monthly_gain / source_monthly_income) * Decimal("100")).quantize(Decimal("0.1"))

    return {
        "capital_applied": float(capital_amount),
        "source": {
            "ticker": source_ticker.upper(),
            "price": float(source_price),
            "shares_to_sell": int(source_shares),
            "dividend_yield_annual": float(source_yield_annual),
            "monthly_income": float(source_monthly_income.quantize(Decimal("0.01"))),
            "annual_income": float(source_annual_income.quantize(Decimal("0.01")))
        },
        "target": {
            "ticker": target_ticker.upper(),
            "price": float(target_price),
            "shares_to_buy": int(target_shares),
            "dividend_yield_annual": float(target_yield_annual),
            "monthly_income": float(target_monthly_income.quantize(Decimal("0.01"))),
            "annual_income": float(target_annual_income.quantize(Decimal("0.01")))
        },
        "comparison": {
            "monthly_cashflow_increase": float(monthly_gain.quantize(Decimal("0.01"))),
            "annual_cashflow_increase": float(annual_gain.quantize(Decimal("0.01"))),
            "percentage_increase": float(percentage_increase),
            "recommendation": "Troca vantajosa para fluxo de proventos" if monthly_gain > 0 else "Troca reduz o fluxo de proventos"
        }
    }
