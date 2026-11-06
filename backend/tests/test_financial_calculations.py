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

if __name__ == "__main__": unittest.main()
