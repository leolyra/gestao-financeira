import httpx
from typing import Optional, List, Dict, Any
from app.core.config import settings

BASE_URL = "https://api.pluggy.ai"

class PluggyService:
    def __init__(self):
        self.client_id = settings.PLUGGY_CLIENT_ID
        self.client_secret = settings.PLUGGY_CLIENT_SECRET
        self._api_key: Optional[str] = None

    async def get_api_key(self) -> str:
        if self._api_key:
            return self._api_key
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                f"{BASE_URL}/auth",
                json={
                    "clientId": self.client_id,
                    "clientSecret": self.client_secret
                }
            )
            if res.status_code != 200:
                raise Exception(f"Erro ao autenticar na Pluggy: {res.text}")
            data = res.json()
            self._api_key = data.get("apiKey")
            return self._api_key

    async def create_connect_token(self) -> str:
        api_key = await self.get_api_key()
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                f"{BASE_URL}/connect_token",
                headers={"X-API-KEY": api_key}
            )
            if res.status_code != 200:
                raise Exception(f"Erro ao gerar connect token: {res.text}")
            return res.json().get("accessToken")

    async def get_all_items(self) -> List[Dict[str, Any]]:
        api_key = await self.get_api_key()
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.get(
                f"{BASE_URL}/items",
                headers={"X-API-KEY": api_key}
            )
            if res.status_code != 200:
                raise Exception(f"Erro ao buscar conexoes existentes: {res.text}")
            return res.json().get("results", [])

    async def get_accounts(self, item_id: str) -> List[Dict[str, Any]]:
        api_key = await self.get_api_key()
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.get(
                f"{BASE_URL}/accounts",
                params={"itemId": item_id},
                headers={"X-API-KEY": api_key}
            )
            if res.status_code != 200:
                raise Exception(f"Erro ao buscar contas: {res.text}")
            return res.json().get("results", [])

    async def get_transactions(self, account_id: str) -> List[Dict[str, Any]]:
        api_key = await self.get_api_key()
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.get(
                f"{BASE_URL}/transactions",
                params={"accountId": account_id, "pageSize": 500},
                headers={"X-API-KEY": api_key}
            )
            if res.status_code != 200:
                raise Exception(f"Erro ao buscar transações: {res.text}")
            return res.json().get("results", [])

pluggy_service = PluggyService()
