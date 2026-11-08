import unittest
from decimal import Decimal
from types import SimpleNamespace

from app.api.endpoints.mcp import effective_asset_type, reconciliation_reasons


class MCPReconciliationTests(unittest.TestCase):
    def transaction(self, quantity="20000", total_amount="200"):
        return SimpleNamespace(quantity=Decimal(quantity), total_amount=Decimal(total_amount))

    def asset(self, ticker="CDB - ITAU UNIBANCO", name="CDB - ITAU UNIBANCO S.A.", asset_type="Renda Fixa"):
        return SimpleNamespace(ticker_current=ticker, name=name, asset_type=asset_type)

    def test_jpmc3_alias_is_always_exposed_as_bdr(self):
        self.assertEqual(effective_asset_type("JPMC3", "Ações"), "BDR")

    def test_canonical_jpmc34_is_always_exposed_as_bdr(self):
        self.assertEqual(effective_asset_type("JPMC34", "Ações"), "BDR")

    def test_generic_itau_cdb_is_pending_even_with_positive_amount(self):
        reasons = reconciliation_reasons(self.transaction("20000", "200"), self.asset())
        self.assertIn("CDB_generico_sem_identificador", reasons)

    def test_generic_itau_cdb_quantities_remain_pending_without_individual_ticker(self):
        for quantity in ("10000", "96000"):
            with self.subTest(quantity=quantity):
                reasons = reconciliation_reasons(self.transaction(quantity, "100"), self.asset())
                self.assertIn("CDB_generico_sem_identificador", reasons)

    def test_individual_itau_cdb_ticker_is_valid_for_any_quantity_at_one_cent(self):
        for ticker, quantity in (("CDBA261THOI", "96000"), ("CDB3250492C", "123099"), ("CDB7261U8FW", "40000")):
            with self.subTest(ticker=ticker):
                reasons = reconciliation_reasons(
                    self.transaction(quantity, "100"),
                    self.asset(ticker=ticker),
                )
                self.assertNotIn("CDB_generico_sem_identificador", reasons)
                self.assertEqual(reasons, [])

    def test_generic_itau_cdb_ticker_stays_pending(self):
        for ticker in ("", "CDB - ITAU UNIBANCO", "CDB-ITAU UNIBANCO"):
            with self.subTest(ticker=ticker):
                reasons = reconciliation_reasons(
                    self.transaction("20000", "200"),
                    self.asset(ticker=ticker),
                )
                self.assertIn("CDB_generico_sem_identificador", reasons)

    def test_zero_value_remains_pending(self):
        reasons = reconciliation_reasons(self.transaction("1", "0"), self.asset("CDB123", "CDB Itaú"))
        self.assertIn("valor_total_zerado", reasons)


if __name__ == "__main__":
    unittest.main()
