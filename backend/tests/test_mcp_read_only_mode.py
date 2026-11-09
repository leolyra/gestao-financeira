import unittest
from unittest.mock import patch

from app.api.endpoints.mcp import available_tools, call_tool


class MCPReadOnlyModeTests(unittest.TestCase):
    def test_write_tool_is_not_advertised_by_default(self):
        with patch("app.api.endpoints.mcp.settings.MCP_ENABLE_WRITES", False):
            names = {tool["name"] for tool in available_tools()}
        self.assertNotIn("apply_asset_classification", names)
        self.assertIn("portfolio_assets", names)
        self.assertIn("portfolio_transactions", names)
        self.assertIn("financial_accounts", names)
        self.assertIn("financial_cash_flow", names)
        self.assertIn("financial_expenses_by_category", names)
        self.assertIn("investment_positions", names)
        self.assertIn("investment_income", names)
        self.assertFalse(names.intersection({"apply_asset_classification"}))

    def test_write_tool_is_rejected_even_if_called_directly(self):
        with patch("app.api.endpoints.mcp.settings.MCP_ENABLE_WRITES", False):
            result = call_tool(
                "apply_asset_classification",
                {"ticker": "PETR4", "asset_type": "Ações", "approved": True},
                db=None,
                user=None,
            )
        self.assertTrue(result.get("isError"))
        self.assertIn("somente leitura", result["content"][0]["text"])

    def test_write_tool_can_only_be_advertised_after_explicit_opt_in(self):
        with patch("app.api.endpoints.mcp.settings.MCP_ENABLE_WRITES", True):
            names = {tool["name"] for tool in available_tools()}
        self.assertIn("apply_asset_classification", names)


if __name__ == "__main__":
    unittest.main()
