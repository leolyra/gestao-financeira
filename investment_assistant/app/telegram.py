import logging
from typing import Any

import httpx
from openai import AsyncOpenAI

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
openai_client = AsyncOpenAI(api_key=settings.openai_api_key)

SYSTEM_INSTRUCTIONS = """
Você é o assistente de investimentos do proprietário desta carteira.
Responda em português brasileiro, com clareza e rigor.
Use as ferramentas MCP para consultar dados pessoais; não invente posições,
valores, cotações ou movimentações. Diferencie dados por origem e não some
Open Finance com custódia sem reconciliação. Quantidade líquida calculada por
compras menos vendas é provisória. Cotações armazenadas não são necessariamente
preços em tempo real. Não execute nem prometa executar ordens de compra ou venda.
CDBs contam para patrimônio e risco, mas não devem dominar as análises individuais.
Opções, estruturados e tickers terminados em 12 ou 13 não devem gerar recomendações.
Quando faltarem dados, informe a limitação e peça validação.
""".strip()


async def telegram_send(chat_id: int, text: str) -> None:
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    async with httpx.AsyncClient(timeout=20) as client:
        # Telegram message text limit is 4096 characters.
        for start in range(0, len(text), 3900):
            chunk = text[start:start + 3900]
            response = await client.post(url, json={"chat_id": chat_id, "text": chunk})
            response.raise_for_status()


async def answer_with_openai(user_text: str) -> str:
    response = await openai_client.responses.create(
        model=settings.openai_model,
        instructions=SYSTEM_INSTRUCTIONS,
        input=user_text,
        tools=[
            {
                "type": "mcp",
                "server_label": "investment_portfolio",
                "server_description": "Ferramentas de consulta somente leitura da carteira de investimentos do usuário.",
                "server_url": settings.mcp_public_url,
                "authorization": settings.mcp_bearer_token,
                "require_approval": "never",
            }
        ],
        store=False,
    )
    return response.output_text or "Não consegui produzir uma resposta textual para esta solicitação."


async def process_telegram_update(update: dict[str, Any]) -> None:
    message = update.get("message") or update.get("edited_message")
    if not message or not message.get("text"):
        return

    chat = message.get("chat") or {}
    chat_id = int(chat.get("id"))
    if chat_id not in settings.allowed_chat_ids:
        logger.warning("Telegram message rejected: chat_id is not allowlisted")
        return

    user_text = str(message["text"]).strip()[:4000]
    if not user_text:
        return

    if user_text in {"/start", "/help", "/ajuda"}:
        await telegram_send(
            chat_id,
            "Assistente de investimentos conectado. Exemplos:\n"
            "/carteira — resumo das movimentações\n"
            "/posicoes — posições calculadas separadamente por origem\n"
            "/renda — dividendos, JCP e rendimentos\n"
            "/ativos — consulte um ticker, por exemplo: /ativo PETR4\n"
            "Também pode enviar perguntas em linguagem natural. "
            "Este bot consulta dados, mas não executa operações.",
        )
        return

    prompts = {
        "/carteira": "Faça um resumo da carteira usando os dados disponíveis, mantendo as fontes separadas.",
        "/posicoes": "Liste as posições provisórias por ativo e por origem, sem consolidar fontes.",
        "/renda": "Resuma dividendos, JCP e rendimentos registrados, separando por origem.",
    }
    if user_text in prompts:
        user_text = prompts[user_text]
    elif user_text.startswith("/ativo "):
        user_text = f"Consulte os detalhes e dados disponíveis do ativo {user_text.split(maxsplit=1)[1]}."

    try:
        answer = await answer_with_openai(user_text)
    except Exception:
        logger.exception("OpenAI Responses API request failed")
        answer = "Não consegui consultar o assistente agora. Tente novamente em alguns minutos."

    await telegram_send(chat_id, answer)
