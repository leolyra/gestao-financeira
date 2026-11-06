import httpx
import time
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from app.core.config import settings

BASE_URL = "https://api.pluggy.ai"

class PluggyService:
    def __init__(self):
        self._api_key: Optional[str] = None
        self._api_key_obtained_at: float = 0.0

    def get_credentials(self) -> tuple[str, str]:
        import os
        client_id = (os.environ.get("PLUGGY_CLIENT_ID") or settings.PLUGGY_CLIENT_ID or "").strip().replace('"', "").replace("'", "").strip()
        client_secret = (os.environ.get("PLUGGY_CLIENT_SECRET") or settings.PLUGGY_CLIENT_SECRET or "").strip().replace('"', "").replace("'", "").strip()
        return client_id, client_secret

    async def get_api_key(self, force_refresh: bool = False) -> str:
        client_id, client_secret = self.get_credentials()
        if not client_id or not client_secret:
            raise Exception("PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET não configurados no ambiente.")

        token_age = time.time() - self._api_key_obtained_at
        if not force_refresh and self._api_key and token_age < 3600:
            return self._api_key
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(
                f"{BASE_URL}/auth",
                headers={
                    "accept": "application/json",
                    "content-type": "application/json"
                },
                json={
                    "clientId": client_id,
                    "clientSecret": client_secret
                }
            )
            if res.status_code != 200:
                error_msg = res.text
                if res.status_code in (401, 403):
                    raise Exception(
                        f"Falha de autenticação na Pluggy ({res.status_code}): Client ID ou Client Secret incorretos. "
                        f"Verifique se as credenciais de PRODUÇÃO foram configuradas no Easypanel. Detalhes: {error_msg}"
                    )
                raise Exception(f"Erro ao autenticar na Pluggy ({res.status_code}): {error_msg}")
            
            data = res.json()
            self._api_key = data.get("apiKey")
            self._api_key_obtained_at = time.time()
            return self._api_key

    async def _request(self, method: str, path: str, params: Optional[Dict[str, Any]] = None, json_data: Optional[Dict[str, Any]] = None) -> httpx.Response:
        api_key = await self.get_api_key()
        url = f"{BASE_URL}{path}"
        headers = {
            "X-API-KEY": api_key,
            "accept": "application/json"
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.request(method, url, headers=headers, params=params, json=json_data)
            
            if res.status_code in (401, 403):
                print(f"[PLUGGY] Status {res.status_code} na rota {path}. Renovando chave e tentando novamente...")
                self._api_key = None
                new_key = await self.get_api_key(force_refresh=True)
                headers["X-API-KEY"] = new_key
                res = await client.request(method, url, headers=headers, params=params, json=json_data)
            
            return res

    async def create_connect_token(self, client_user_id: Optional[str] = None) -> str:
        payload = {"options": {"clientUserId": str(client_user_id), "avoidDuplicates": True}} if client_user_id else {}
        res = await self._request("POST", "/connect_token", json_data=payload)
        if res.status_code != 200:
            raise Exception(f"Erro ao gerar connect token: {res.text}")
        return res.json().get("accessToken")

    async def get_all_items(self) -> List[Dict[str, Any]]:
        res = await self._request("GET", "/items")
        if res.status_code != 200:
            print(f"[PLUGGY] Erro ao buscar /items ({res.status_code}): {res.text}")
            raise Exception(f"Erro ao buscar conexoes existentes: {res.text}")
        return res.json().get("results", [])

    async def get_account(self, account_id: str) -> Dict[str, Any]:
        try:
            res = await self._request("GET", f"/accounts/{account_id}")
            if res.status_code == 200:
                return res.json()
            print(f"[PLUGGY] /accounts/{account_id} retornou {res.status_code}: {res.text}")
        except Exception as e:
            print(f"[PLUGGY] Erro ao buscar conta {account_id}: {e}")
        return {}

    async def get_item_resources(self, item_id: str) -> Dict[str, Any]:
        try:
            res = await self._request("GET", f"/items/{item_id}/resources")
            if res.status_code == 200:
                return res.json()
        except Exception as e:
            print(f"[PLUGGY] Aviso ao buscar recursos do item {item_id}: {e}")
        return {}

    async def get_accounts(self, item_id: str) -> List[Dict[str, Any]]:
        res = await self._request("GET", "/accounts", params={"itemId": item_id})
        if res.status_code != 200:
            print(f"[PLUGGY] Erro ao buscar /accounts ({res.status_code}): {res.text}")
            raise Exception(f"Erro ao buscar contas: {res.text}")
        return res.json().get("results", [])

    async def get_item(self, item_id: str) -> Dict[str, Any]:
        res = await self._request("GET", f"/items/{item_id}")
        if res.status_code != 200:
            return {}
        return res.json()

    async def get_bills(self, account_id: str) -> List[Dict[str, Any]]:
        try:
            return await self._get_all_pages("/bills", {"accountId": account_id})
        except Exception as exc:
            print(f"[PLUGGY] Falha ao paginar faturas: {exc}")
            return []

    async def _get_all_pages(self, path: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        collected, seen = [], set()
        for page in range(1, 101):
            response = await self._request("GET", path, params={**params, "page": page, "pageSize": 500})
            if response.status_code != 200:
                if page == 1: raise Exception(f"Pluggy {path} retornou {response.status_code}: {response.text}")
                break
            payload=response.json(); rows=payload.get("results",[])
            if not rows: break
            for row in rows:
                key=str(row.get("id")) if row.get("id") is not None else repr(row)
                if key not in seen: seen.add(key); collected.append(row)
            pagination=payload.get("pagination") or {}
            total_pages=pagination.get("totalPages") or pagination.get("total_pages")
            if total_pages and page>=int(total_pages): break
            if len(rows)<500: break
        return collected

    async def get_transactions(self, account_id: str, bill_id: Optional[str] = None, from_date: Optional[str] = None) -> List[Dict[str, Any]]:
        params={"accountId":account_id}
        if bill_id: params["billId"]=bill_id
        else: params["from"]=from_date or "2000-01-01"
        for path in ("/v2/transactions","/transactions"):
            try:
                rows=await self._get_all_pages(path,params)
                if rows:return rows
            except Exception as exc:
                print(f"[PLUGGY] Falha paginando {path}: {exc}")
        return []

    async def get_investments(self, item_id: str) -> List[Dict[str, Any]]:
        try: return await self._get_all_pages("/investments", {"itemId": item_id})
        except Exception as exc:
            print(f"[PLUGGY] Falha ao paginar investimentos: {exc}")
            return []

    async def get_investment_transactions(self, investment_id: str) -> List[Dict[str, Any]]:
        try: return await self._get_all_pages(f"/investments/{investment_id}/transactions", {})
        except Exception as exc:
            print(f"[PLUGGY] Falha ao paginar operações do investimento: {exc}")
            return []

pluggy_service = PluggyService()
