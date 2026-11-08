import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
import app as gateway


class GatewaySecurityTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {
            "GATEWAY_API_TOKEN": "test-client-token",
            "TELEGRAM_APPROVAL_BRIDGE_TOKEN": "test-bridge-token",
            "TELEGRAM_ALLOWED_USER_ID": "157555157",
            "APPROVAL_DB_PATH": str(Path(self.tempdir.name) / "approvals.sqlite3"),
            "N8N_BASE_URL": "http://127.0.0.1:9",
            "N8N_API_KEY": "test-n8n-key",
        })
        self.env.start()
        self.client = TestClient(gateway.app)
        self.auth = {"Authorization": "Bearer test-client-token"}
        self.bridge = {
            "X-Telegram-Bridge-Token": "test-bridge-token",
            "X-Telegram-User-Id": "157555157",
        }

    def tearDown(self):
        self.env.stop()
        self.tempdir.cleanup()

    def create_proposal(self):
        response = self.client.post("/v1/proposals", headers=self.auth, json={
            "operation": "create_workflow",
            "payload": {"name": "approved-test", "nodes": [], "connections": {}},
        })
        self.assertEqual(response.status_code, 201)
        return response.json()["id"]

    def test_health_is_public_and_minimal(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_workflow_list_requires_gateway_bearer(self):
        self.assertEqual(self.client.get("/v1/workflows").status_code, 401)

    def test_proposal_requires_gateway_authentication(self):
        response = self.client.post("/v1/proposals", json={
            "operation": "create_workflow",
            "payload": {"name": "x", "nodes": [], "connections": {}},
        })
        self.assertEqual(response.status_code, 401)

    def test_proposal_is_pending_and_does_not_execute(self):
        with patch.object(gateway, "n8n_request", new=AsyncMock()) as mocked:
            proposal_id = self.create_proposal()
            self.assertEqual(self.client.get("/v1/proposals/pending", headers=self.auth).json()["data"][0]["id"], proposal_id)
            mocked.assert_not_awaited()

    def test_only_configured_telegram_user_can_approve(self):
        proposal_id = self.create_proposal()
        headers = {**self.bridge, "X-Telegram-User-Id": "999"}
        response = self.client.post(f"/v1/proposals/{proposal_id}/approve", headers=headers)
        self.assertEqual(response.status_code, 403)

    def test_approval_requires_bridge_secret(self):
        proposal_id = self.create_proposal()
        response = self.client.post(
            f"/v1/proposals/{proposal_id}/approve",
            headers={"X-Telegram-User-Id": "157555157"},
        )
        self.assertEqual(response.status_code, 401)

    def test_approved_proposal_executes_once(self):
        proposal_id = self.create_proposal()
        mocked = AsyncMock(return_value={"id": "new-workflow"})
        with patch.object(gateway, "n8n_request", new=mocked):
            response = self.client.post(f"/v1/proposals/{proposal_id}/approve", headers=self.bridge)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["status"], "completed")
            self.assertEqual(mocked.await_count, 1)
            second = self.client.post(f"/v1/proposals/{proposal_id}/approve", headers=self.bridge)
            self.assertEqual(second.status_code, 409)
            self.assertEqual(mocked.await_count, 1)

    def test_reject_proposal_is_terminal_and_cannot_be_replayed(self):
        proposal_id = self.create_proposal()
        response = self.client.post(f"/v1/proposals/{proposal_id}/reject", headers=self.bridge)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "rejected")
        again = self.client.post(f"/v1/proposals/{proposal_id}/reject", headers=self.bridge)
        self.assertEqual(again.status_code, 409)
        approve = self.client.post(f"/v1/proposals/{proposal_id}/approve", headers=self.bridge)
        self.assertEqual(approve.status_code, 409)

    def test_reject_requires_bridge_authentication(self):
        proposal_id = self.create_proposal()
        response = self.client.post(
            f"/v1/proposals/{proposal_id}/reject",
            headers={"X-Telegram-User-Id": "157555157"},
        )
        self.assertEqual(response.status_code, 401)

    def test_expired_proposal_cannot_be_rejected(self):
        proposal_id = self.create_proposal()
        with gateway.db_session() as conn:
            conn.execute(
                "UPDATE proposals SET expires_at=? WHERE id=?",
                ("2000-01-01T00:00:00+00:00", proposal_id),
            )
        response = self.client.post(f"/v1/proposals/{proposal_id}/reject", headers=self.bridge)
        self.assertEqual(response.status_code, 410)
        with gateway.db_session() as conn:
            status = conn.execute("SELECT status FROM proposals WHERE id=?", (proposal_id,)).fetchone()["status"]
        self.assertEqual(status, "expired")

    def test_approve_and_reject_race_has_single_winner(self):
        from concurrent.futures import ThreadPoolExecutor
        proposal_id = self.create_proposal()
        with patch.object(gateway, "n8n_request", new=AsyncMock(return_value={"id": "created"})):
            def decide(action):
                return self.client.post(f"/v1/proposals/{proposal_id}/{action}", headers=self.bridge).status_code
            with ThreadPoolExecutor(max_workers=2) as pool:
                statuses = list(pool.map(decide, ["approve", "reject"]))
        self.assertEqual(sum(status == 200 for status in statuses), 1)
        self.assertEqual(sum(status in (409, 410) for status in statuses), 1)

    def test_direct_write_routes_do_not_exist(self):
        self.assertEqual(self.client.post("/v1/workflows", headers=self.auth).status_code, 405)
        self.assertEqual(self.client.put("/v1/workflows/123", headers=self.auth).status_code, 404)
        self.assertEqual(self.client.delete("/v1/workflows/123", headers=self.auth).status_code, 404)
        self.assertEqual(self.client.post("/v1/workflows/123/execute", headers=self.auth).status_code, 404)

    def test_unsupported_project_routes_do_not_exist(self):
        self.assertEqual(self.client.get("/v1/projects", headers=self.auth).status_code, 404)
        self.assertEqual(self.client.post("/v1/workflows/123/transfer", headers=self.auth).status_code, 404)


if __name__ == "__main__":
    unittest.main()
