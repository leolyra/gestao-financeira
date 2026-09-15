import httpx
import time
from typing import Optional, List, Dict, Any
from app.core.config import settings

BASE_URL = "https://api.pluggy.ai"

class PluggyService:
    def __init__(self):
        self._api_key: Optional[str] = None
        self._api_key_obtained_at: float = 0.0

    def get_credentials(self) -> tuple[str, str]:
        import os
        # Leitura direta do os.environ para garantir atualização imediata após salvar no Easypanel
        client_id = (os.environ.get("PLUGGY_CLIENT_ID") or settings.PLUGGY_CLIENT_ID or "").strip().strip("\"'").strip()
        client_secret = (os.environ.get("PLUGGY_CLIENT_SECRET") or settings.PLUGGY_CLIENT_SECRET or "").strip().strip("\"'").strip()
        return client_id, client_secret

    async def get_api_key(self, force_refresh: bool = False) -> str:
        client_id, client_secret = self.get_credentials()
        if not client_id or not client_secret:
            raise Exception("PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET não configurados no ambiente.")

        # O token da Pluggy expira em cerca de 2 horas (7200s). Renovamos com margem de segurança (3600s).
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
            
            # Se receber 401 ou 403 de token expirado/inválido/não autorizado, renova a API Key e tenta novamente
            if res.status_code in (401, 403):
                print(f"[PLUGGY] Status {res.status_code} na rota {path}. Renovando chave e tentando novamente...")
                self._api_key = None
                new_key = await self.get_api_key(force_refresh=True)
                headers["X-API-KEY"] = new_key
                res = await client.request(method, url, headers=headers, params=params, json=json_data)
            
            return res

    async def create_connect_token(self) -> str:
        res = await self._request("POST", "/connect_token")
        if res.status_code != 200:
            raise Exception(f"Erro ao gerar connect token: {res.text}")
        return res.json().get("accessToken")

    async def get_all_items(self) -> List[Dict[str, Any]]:
        res = await self._request("GET", "/items")
        if res.status_code != 200:
            raise Exception(f"Erro ao buscar conexoes existentes: {res.text}")
        return res.json().get("results", [])

    async def get_accounts(self, item_id: str) -> List[Dict[str, Any]]:
        res = await self._request("GET", "/accounts", params={"itemId": item_id})
        if res.status_code != 200:
            raise Exception(f"Erro ao buscar contas: {res.text}")
        return res.json().get("results", [])

    async def get_item(self, item_id: str) -> Dict[str, Any]:
        res = await self._request("GET", f"/items/{item_id}")
        if res.status_code != 200:
            return {}
        return res.json()

    async def get_bills(self, account_id: str) -> List[Dict[str, Any]]:
        try:
            res = await self._request("GET", "/bills", params={"accountId": account_id, "pageSize": 100})
            if res.status_code == 200:
                return res.json().get("results", [])
        except Exception as e:
            print(f"[PLUGGY] Aviso ao buscar faturas em /bills: {e}")
        return []

    async def get_transactions(self, account_id: str, bill_id: Optional[str] = None) -> List[Dict[str, Any]]:
        params = {"accountId": account_id}
        if bill_id:
            params["billId"] = bill_id
        else:
            params["pageSize"] = 500

        # 1. Tenta a API V2 (padrão oficial para novas aplicações e Open Finance)
        try:
            res_v2 = await self._request("GET", "/v2/transactions", params=params)
            if res_v2.status_code == 200:
                data = res_v2.json()
                results = data.get("results", [])
                if results:
                    return results
        except Exception as e:
            print(f"[PLUGGY] Aviso ao buscar em /v2/transactions: {e}")

        # 2. Fallback para /transactions (V1)
        try:
            res_v1 = await self._request("GET", "/transactions", params=params)
            if res_v1.status_code == 200:
                data = res_v1.json()
                results = data.get("results", [])
                if results:
                    return results
        except Exception as e:
            print(f"[PLUGGY] Aviso ao buscar em /transactions: {e}")

        # 3. Tenta sem o parâmetro pageSize caso a API prefira paginação pura por cursor
        if not bill_id:
            try:
                res_v2_simple = await self._request("GET", "/v2/transactions", params={"accountId": account_id})
                if res_v2_simple.status_code == 200:
                    return res_v2_simple.json().get("results", [])
            except Exception:
                pass

        return []

    async def get_investments(self, item_id: str) -> List[Dict[str, Any]]:
        try:
            res = await self._request("GET", "/investments", params={"itemId": item_id, "pageSize": 500})
            if res.status_code == 200:
                return res.json().get("results", [])
        except Exception as e:
            print(f"[PLUGGY] Aviso ao buscar investimentos em /investments: {e}")
        return []

    async def get_investment_transactions(self, investment_id: str) -> List[Dict[str, Any]]:
        try:
            res = await self._request("GET", f"/investments/{investment_id}/transactions", params={"pageSize": 500})
            if res.status_code == 200:
                return res.json().get("results", [])
        except Exception as e:
            print(f"[PLUGGY] Aviso ao buscar transacoes do investimento {investment_id}: {e}")
        return []

pluggy_service = PluggyService()
