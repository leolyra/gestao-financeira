import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
import app as gateway

class GatewaySecurityTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            "GATEWAY_API_TOKEN": "test-client-token",
            "GATEWAY_WRITE_APPROVAL_TOKEN": "test-approval-token",
            "N8N_BASE_URL": "http://127.0.0.1:9",
            "N8N_API_KEY": "test-n8n-key",
        })
        self.env.start()
        self.client = TestClient(gateway.app)

    def tearDown(self):
        self.env.stop()

    def test_health_is_public_and_minimal(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_workflow_list_requires_gateway_bearer(self):
        self.assertEqual(self.client.get("/v1/workflows").status_code, 401)

    def test_write_requires_both_authentication_and_approval(self):
        payload = {"name": "safe-test", "nodes": [], "connections": {}}
        headers = {"Authorization": "Bearer test-client-token"}
        response = self.client.post("/v1/workflows", json=payload, headers=headers)
        self.assertEqual(response.status_code, 403)

    def test_write_rejects_unknown_fields(self):
        payload = {"name": "safe-test", "nodes": [], "connections": {}, "active": True}
        headers = {
            "Authorization": "Bearer test-client-token",
            "X-Write-Approval": "test-approval-token",
        }
        response = self.client.post("/v1/workflows", json=payload, headers=headers)
        self.assertEqual(response.status_code, 422)

    def test_unsupported_project_and_dangerous_routes_do_not_exist(self):
        headers = {"Authorization": "Bearer test-client-token"}
        self.assertEqual(self.client.get("/v1/projects", headers=headers).status_code, 404)
        self.assertEqual(self.client.post("/v1/workflows/123/transfer", headers=headers).status_code, 404)
        self.assertEqual(self.client.post("/v1/workflows/123/execute", headers=headers).status_code, 404)
        self.assertEqual(self.client.delete("/v1/workflows/123", headers=headers).status_code, 405)

if __name__ == "__main__":
    unittest.main()
