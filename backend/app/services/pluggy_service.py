import httpx
import time
import random
from email.utils import parsedate_to_datetime
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from app.core.config import settings

BASE_URL = "https://api.pluggy.ai"

class PluggyService:
    def __init__(self):
        self._api_key: Optional[str] = None
        self._api_key_obtained_at: float = 0.0
        self._request_lock = asyncio.Lock()
        self._last_request_at = 0.0
        self._minimum_request_interval = 0.25
        self._max_rate_limit_retries = 5

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

    def _retry_after_seconds(self, response: httpx.Response) -> Optional[float]:
        value = response.headers.get("Retry-After")
        if not value:
            return None
        try:
            return max(0.0, float(value))
        except (TypeError, ValueError):
            try:
                retry_at = parsedate_to_datetime(value)
                return max(0.0, (retry_at - datetime.now(retry_at.tzinfo)).total_seconds())
            except Exception:
                return None

    async def _request(self, method: str, path: str, params: Optional[Dict[str, Any]] = None, json_data: Optional[Dict[str, Any]] = None) -> httpx.Response:
        url = f"{BASE_URL}{path}"
        async with self._request_lock:
            async with httpx.AsyncClient(timeout=30.0) as client:
                for attempt in range(self._max_rate_limit_retries + 1):
                    wait_for_spacing = self._minimum_request_interval - (time.monotonic() - self._last_request_at)
                    if wait_for_spacing > 0:
                        await asyncio.sleep(wait_for_spacing)

                    api_key = await self.get_api_key()
                    headers = {"X-API-KEY": api_key, "accept": "application/json"}
                    response = await client.request(method, url, headers=headers, params=params, json=json_data)
                    self._last_request_at = time.monotonic()

                    if response.status_code in (401, 403):
                        print(f"[PLUGGY] Status {response.status_code} na rota {path}. Renovando chave e tentando novamente...")
                        self._api_key = None
                        headers["X-API-KEY"] = await self.get_api_key(force_refresh=True)
                        response = await client.request(method, url, headers=headers, params=params, json=json_data)
                        self._last_request_at = time.monotonic()

                    if response.status_code != 429:
                        return response

                    if attempt >= self._max_rate_limit_retries:
                        print(f"[PLUGGY] Limite de tentativas 429 atingido na rota {path}.")
                        return response

                    retry_after = self._retry_after_seconds(response)
                    backoff = min(30.0, 2 ** attempt) + random.uniform(0.0, 0.5)
                    delay = min(120.0, retry_after) if retry_after is not None else backoff
                    print(f"[PLUGGY] HTTP 429 em {path}; aguardando {delay:.1f}s antes da tentativa {attempt + 2}/{self._max_rate_limit_retries + 1}.")
                    await asyncio.sleep(delay)

                raise RuntimeError("Fluxo inesperado de retentativa Pluggy.")

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
                raise Exception(f"Pluggy {path} retornou {response.status_code}: {response.text}. Paginação interrompida; resultados parciais não serão tratados como completos.")
            payload=response.json(); rows=payload.get("results",[])
            if not rows: break
            previous_count=len(collected)
            for row in rows:
                key=str(row.get("id")) if row.get("id") is not None else repr(row)
                if key not in seen: seen.add(key); collected.append(row)
            pagination=payload.get("pagination") or {}
            total_pages=pagination.get("totalPages") or pagination.get("total_pages")
            if total_pages and page>=int(total_pages): break
            if len(collected)==previous_count: break
        return collected

    async def _get_cursor_pages(self, path: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Percorre endpoints Pluggy v2 seguindo literalmente o campo next."""
        collected: List[Dict[str, Any]] = []
        seen_ids = set()
        next_query: Optional[str] = None
        seen_cursors = set()

        for _ in range(1000):
            request_path = path + next_query if next_query else path
            response = await self._request(
                "GET",
                request_path,
                params=params if next_query is None else None
            )
            if response.status_code != 200:
                raise Exception(f"Pluggy {path} retornou {response.status_code}: {response.text}")

            payload = response.json()
            for row in payload.get("results", []):
                row_id = row.get("id")
                key = str(row_id) if row_id is not None else repr(row)
                if key not in seen_ids:
                    seen_ids.add(key)
                    collected.append(row)

            next_value = payload.get("next")
            if not next_value:
                return collected
            if not isinstance(next_value, str) or not next_value.startswith("?"):
                raise Exception(f"Pluggy {path} retornou cursor next inválido.")
            if next_value in seen_cursors:
                raise Exception(f"Pluggy {path} repetiu o cursor de paginação.")
            seen_cursors.add(next_value)
            next_query = next_value

        raise Exception(f"Pluggy {path} excedeu o limite de 1000 páginas.")

    async def get_transactions(self, account_id: str, bill_id: Optional[str] = None, from_date: Optional[str] = None) -> List[Dict[str, Any]]:
        # GET /v2/transactions aceita accountId e filtros dateFrom/dateTo,
        # não aceita from/page/pageSize nem billId. Transações de cartão
        # são recuperadas pela conta; não chamar o endpoint legado /transactions.
        params: Dict[str, Any] = {"accountId": account_id}
        if from_date:
            params["dateFrom"] = from_date
        return await self._get_cursor_pages("/v2/transactions", params)

    async def get_investments(self, item_id: str) -> List[Dict[str, Any]]:
        return await self._get_all_pages("/investments", {"itemId": item_id})

    async def get_investment_transactions(self, investment_id: str) -> List[Dict[str, Any]]:
        return await self._get_all_pages(f"/investments/{investment_id}/transactions", {})

pluggy_service = PluggyService()
