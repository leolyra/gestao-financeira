import httpx
from typing import Optional, List, Dict, Any
from app.core.config import settings

class OllamaService:
    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL.rstrip("/")

    async def list_models(self) -> List[str]:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    models = res.json().get("models", [])
                    return [m.get("name") for m in models]
        except Exception:
            pass
        return []

    async def summarize_report(self, text: str, ticker: str, model_name: Optional[str] = None) -> str:
        models = await self.list_models()
        chosen_model = model_name or (models[0] if models else "llama3")

        prompt = f"""Você é um analista financeiro sênior especializado no mercado brasileiro (B3, Ações e FIIs).
Analise o relatório abaixo referente ao ativo {ticker} e produza um resumo estruturado e direto ao ponto.

Siga rigorosamente estas seções em português:
1. RESUMO EXECUTIVO (3 a 4 linhas)
2. RESULTADOS FINANCEIROS & OPERACIONAIS (Receita, FFO, Lucro ou NOI)
3. PROVENTOS & DIVIDENDOS (Valores distribuídos, rendimento mensal ou guidance)
4. OPERAÇÕES / CARTEIRA (Vacância, inadimplência, novos contratos ou aquisições)
5. PRINCIPAIS RISCOS E PONTOS DE ATENÇÃO

Texto do Relatório:
{text[:12000]}
"""
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                res = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": chosen_model,
                        "prompt": prompt,
                        "stream": False
                    }
                )
                if res.status_code == 200:
                    return res.json().get("response", "Não foi possível gerar o resumo.")
                return f"Erro ao consultar Ollama: status {res.status_code}"
        except Exception as e:
            return f"Erro de conexão com o Ollama local ({self.base_url}): {str(e)}"

ollama_service = OllamaService()
