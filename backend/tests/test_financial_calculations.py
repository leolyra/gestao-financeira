import unittest
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from app.services.portfolio_math import calculate_realized_gain
from app.services.time_utils import to_local_naive

class PortfolioMathTests(unittest.TestCase):
    def op(self, id, kind, qty, amount, costs="0", date="2026-11-01"):
        return SimpleNamespace(id=id, asset_id=1, operation_type=kind,
            quantity=Decimal(qty), total_amount=Decimal(amount), costs=Decimal(costs),
            trade_date=datetime.fromisoformat(date))

    def test_weighted_average_cost_and_partial_sale(self):
        ops=[self.op(1,"buy","10","1000"),self.op(2,"buy","10","1200"),
             self.op(3,"sell","5","700","5","2026-11-05")]
        self.assertEqual(calculate_realized_gain(ops,datetime(2026,11,1)),Decimal("145"))

    def test_oversell_proceeds_are_prorated_to_available_quantity(self):
        ops=[self.op(1,"buy","2","200"),self.op(2,"sell","5","600")]
        self.assertEqual(calculate_realized_gain(ops,datetime(2026,11,1)),Decimal("40"))

    def test_utc_timestamps_are_converted_to_brazil_local_time(self):
        utc = datetime(2026, 11, 6, 1, 0, tzinfo=timezone.utc)
        self.assertEqual(to_local_naive(utc), datetime(2026, 11, 5, 22, 0))

    def test_naive_database_datetime_is_preserved(self):
        naive = datetime(2026, 11, 6, 10, 0)
        self.assertEqual(to_local_naive(naive), naive)

    def test_only_sales_inside_period_count(self):
        ops=[self.op(1,"buy","10","1000","0","2026-09-01"),
             self.op(2,"sell","2","300","0","2026-10-01")]
        self.assertEqual(calculate_realized_gain(ops,datetime(2026,11,1)),Decimal("0.00"))


from app.api.endpoints.open_finance import classify_pluggy_investment_transaction


class PluggyInvestmentIncomeClassificationTests(unittest.TestCase):
    def test_explicit_dividend_type(self):
        self.assertEqual(
            classify_pluggy_investment_transaction("DIVIDEND", "Pagamento"),
            "dividend",
        )

    def test_explicit_jcp_description(self):
        self.assertEqual(
            classify_pluggy_investment_transaction("INTEREST", "JCP PETR4"),
            "jcp",
        )

    def test_generic_interest_is_not_assumed_to_be_jcp(self):
        self.assertEqual(
            classify_pluggy_investment_transaction("INTEREST", "Pagamento de juros"),
            "interest",
        )

    def test_treasury_coupon_is_not_investment_income(self):
        self.assertEqual(
            classify_pluggy_investment_transaction("INTEREST", "Cupom Tesouro IPCA+"),
            "interest",
        )

    def test_fii_yield(self):
        self.assertEqual(
            classify_pluggy_investment_transaction("YIELD", "Pagamento"),
            "rendimento",
        )

    def test_amortization_is_not_income(self):
        self.assertEqual(
            classify_pluggy_investment_transaction("AMORTIZATION", "Amortização"),
            "amortization",
        )


if __name__ == "__main__": unittest.main()


import httpx
from app.services.pluggy_service import PluggyService


class PluggyRateLimitTests(unittest.TestCase):
    def setUp(self):
        self.service = PluggyService()

    def test_retry_after_seconds_is_respected(self):
        response = httpx.Response(429, headers={"Retry-After": "7"})
        self.assertEqual(self.service._retry_after_seconds(response), 7.0)

    def test_missing_retry_after_returns_none(self):
        response = httpx.Response(429)
        self.assertIsNone(self.service._retry_after_seconds(response))


class PluggyPaginationFailureTests(unittest.IsolatedAsyncioTestCase):
    async def test_rate_limit_on_later_page_raises_instead_of_returning_partial_data(self):
        service = PluggyService()
        responses = [
            httpx.Response(200, json={"results": [{"id": "tx-1"}], "pagination": {}}),
            httpx.Response(429, text='{"code":429,"message":"Too many requests"}'),
        ]

        async def fake_request(method, path, params=None, json_data=None):
            return responses.pop(0)

        service._request = fake_request

        with self.assertRaisesRegex(Exception, "resultados parciais não serão tratados como completos"):
            await service._get_all_pages("/investments/example/transactions", {})
