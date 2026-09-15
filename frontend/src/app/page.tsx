'use client';

import { useState, useEffect } from 'react';
import { 
  Wallet, 
  TrendingUp, 
  TrendingDown,
  Bell, 
  CreditCard, 
  PlusCircle, 
  Trash2, 
  LogOut, 
  Tag, 
  LayoutDashboard,
  Building2,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  SlidersHorizontal,
  Landmark,
  FileText,
  UploadCloud,
  ArrowLeftRight,
  PieChart,
  Sparkles,
  Bot,
  Target,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { fetchWithAuth, setToken, getToken, removeToken } from '@/lib/api';

interface Account {
  id: number;
  name: string;
  type: string;
  balance: number;
  pluggy_account_id?: string;
}

interface Category {
  id: number;
  name: string;
  type: string;
  color: string;
}

interface Transaction {
  id: number;
  account_id: number;
  category_id?: number;
  description: string;
  amount: number;
  date: string;
  is_manual: boolean;
  pluggy_transaction_id?: string;
  category_name?: string;
  category_color?: string;
  account_name?: string;
}

interface PortfolioPosition {
  asset_id: number;
  ticker: string;
  name: string;
  asset_type: string;
  quantity: number;
  average_price: number;
  total_invested: number;
  total_dividends: number;
}

interface InvestmentSummary {
  total_equity_invested: number;
  monthly_capital_gain: number;
  total_dividends_received: number;
  positions_count: number;
}

interface AssetAlert {
  id: number;
  ticker: string;
  asset_name: string;
  rule_type: string;
  target_value: number;
  current_value?: number;
  is_triggered: boolean;
  is_active: boolean;
  notes?: string;
  created_at: string;
}

interface SwapResult {
  capital_applied: number;
  source: {
    ticker: string;
    price: number;
    shares_to_sell: number;
    dividend_yield_annual: number;
    monthly_income: number;
    annual_income: number;
  };
  target: {
    ticker: string;
    price: number;
    shares_to_buy: number;
    dividend_yield_annual: number;
    monthly_income: number;
    annual_income: number;
  };
  comparison: {
    monthly_cashflow_increase: number;
    annual_cashflow_increase: number;
    percentage_increase: number;
    recommendation: string;
  };
}

interface AssetReportItem {
  id: number;
  ticker: string;
  title: string;
  report_type: string;
  published_at?: string;
  ai_summary: string;
  created_at: string;
}

interface InvestmentTransaction {
  id: number;
  ticker: string;
  asset_name: string;
  asset_type: string;
  operation_type: string;
  quantity: number;
  unit_price: number;
  costs: number;
  total_amount: number;
  trade_date: string;
  source: string;
  notes?: string;
}

interface DashboardSummary {
  total_income: number;
  total_expense: number;
  net_total: number;
  expenses_by_category: { name: string; value: number; color: string }[];
  monthly_trend: { month: string; income: number; expense: number }[];
}

export default function Home() {
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'investments' | 'monitoring' | 'accounts' | 'categories'>('overview');

  // Auth State
  const [isRegister, setIsRegister] = useState(false);
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // Data State
  const [user, setUser] = useState<{ id: number; name: string; email: string } | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  // Monitoring & AI State
  const [alerts, setAlerts] = useState<AssetAlert[]>([]);
  const [reports, setReports] = useState<AssetReportItem[]>([]);
  const [swapResult, setSwapResult] = useState<SwapResult | null>(null);

  // Form Regra de Alerta
  const [alertTicker, setAlertTicker] = useState("");
  const [alertRuleType, setAlertRuleType] = useState("target_price_buy");
  const [alertTargetValue, setAlertTargetValue] = useState("");
  const [alertNotes, setAlertNotes] = useState("");

  // Form Swap de Ativos
  const [swapSourceTicker, setSwapSourceTicker] = useState("");
  const [swapSourcePrice, setSwapSourcePrice] = useState("");
  const [swapSourceYield, setSwapSourceYield] = useState("");
  const [swapTargetTicker, setSwapTargetTicker] = useState("");
  const [swapTargetPrice, setSwapTargetPrice] = useState("");
  const [swapTargetYield, setSwapTargetYield] = useState("");
  const [swapCapital, setSwapCapital] = useState("");

  // Form Upload Relatório IA
  const [reportTicker, setReportTicker] = useState("");
  const [reportTitle, setReportTitle] = useState("");
  const [isSummarizingReport, setIsSummarizingReport] = useState(false);
  const [reportFeedback, setReportFeedback] = useState("");

  // Investment State
  const [portfolio, setPortfolio] = useState<PortfolioPosition[]>([]);
  const [invTransactions, setInvTransactions] = useState<InvestmentTransaction[]>([]);
  // Diagnostics Modal State
  const [showDiagnosticsModal, setShowDiagnosticsModal] = useState(false);
  const [diagnosticsData, setDiagnosticsData] = useState<any>(null);
  const [isLoadingDiagnostics, setIsLoadingDiagnostics] = useState(false);
  const [invSummary, setInvSummary] = useState<InvestmentSummary | null>(null);

  // Modais de Investimento
  const [showSinacorModal, setShowSinacorModal] = useState(false);
  const [showMigrateModal, setShowMigrateModal] = useState(false);
  const [showManualInvModal, setShowManualInvModal] = useState(false);
  const [invUploadMsg, setInvUploadMsg] = useState("");
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);

  // Form Operação Manual Investimento
  const [invTicker, setInvTicker] = useState("");
  const [invOpType, setInvOpType] = useState("buy");
  const [invQty, setInvQty] = useState("");
  const [invUnitPrice, setInvUnitPrice] = useState("");
  const [invCosts, setInvCosts] = useState("");
  const [invDate, setInvDate] = useState(new Date().toISOString().split("T")[0]);

  // Form Migração de Ticker
  const [migrateOld, setMigrateOld] = useState("");
  const [migrateNew, setMigrateNew] = useState("");
  const [migrateMsg, setMigrateMsg] = useState("");

  // Forms
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState('checking');
  const [newAccBalance, setNewAccBalance] = useState('');

  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState('expense');
  const [newCatColor, setNewCatColor] = useState('#3b82f6');

  const [newTxDesc, setNewTxDesc] = useState('');
  const [newTxAmount, setNewTxAmount] = useState('');
  const [newTxType, setNewTxType] = useState<'expense' | 'income'>('expense');
  const [newTxAccountId, setNewTxAccountId] = useState<number | ''>('');
  const [newTxCategoryId, setNewTxCategoryId] = useState<number | ''>('');
  const [newTxDate, setNewTxDate] = useState(new Date().toISOString().split('T')[0]);

  // Pluggy Connect State
  const [isConnectingPluggy, setIsConnectingPluggy] = useState(false);
  const [pluggyStatusMsg, setPluggyStatusMsg] = useState('');
  const [customItemId, setCustomItemId] = useState('');
  const [showItemInput, setShowItemInput] = useState(false);

  useEffect(() => {
    const savedToken = getToken();
    if (savedToken) {
      setTokenState(savedToken);
      loadAllData();
    } else {
      setLoading(false);
    }
  }, []);

  async function loadAllData() {
    try {
      const [meRes, accRes, catRes, txRes, sumRes, portRes, invTxRes, invSumRes] = await Promise.all([
        fetchWithAuth('/auth/me'),
        fetchWithAuth('/accounts/'),
        fetchWithAuth('/categories/'),
        fetchWithAuth('/transactions/'),
        fetchWithAuth('/transactions/summary?days=90'),
        fetchWithAuth('/investments/portfolio'),
        fetchWithAuth('/investments/transactions'),
        fetchWithAuth('/investments/summary')
      ]);

      if (portRes.ok) setPortfolio(await portRes.json());
      if (invTxRes.ok) setInvTransactions(await invTxRes.json());
      if (invSumRes.ok) setInvSummary(await invSumRes.json());

      const [alertsRes, reportsRes] = await Promise.all([
        fetchWithAuth('/monitoring/rules'),
        fetchWithAuth('/monitoring/reports')
      ]);
      if (alertsRes.ok) setAlerts(await alertsRes.json());
      if (reportsRes.ok) setReports(await reportsRes.json());

      if (meRes.ok) setUser(await meRes.json());
      if (accRes.ok) {
        const accs = await accRes.json();
        setAccounts(accs);
        if (accs.length > 0 && newTxAccountId === '') {
          setNewTxAccountId(accs[0].id);
        }
      }
      if (catRes.ok) setCategories(await catRes.json());
      if (txRes.ok) setTransactions(await txRes.json());
      if (sumRes.ok) setSummary(await sumRes.json());
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    const endpoint = isRegister ? '/auth/register' : '/auth/login';
    const payload = isRegister 
      ? { name: authName, email: authEmail, password: authPassword }
      : { email: authEmail, password: authPassword };

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://api-financeira.leo.lyra.nom.br'}/api/v1${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.detail || 'Erro ao autenticar');
        return;
      }

      setToken(data.access_token);
      setTokenState(data.access_token);
      setUser(data.user);
      loadAllData();
    } catch (err) {
      setAuthError('Falha na comunicação com a API.');
    }
  }

  function handleLogout() {
    removeToken();
    setTokenState(null);
    setUser(null);
    setAccounts([]);
    setCategories([]);
    setTransactions([]);
  }

  // Funções de Monitoramento & IA
  async function handleCreateAlert(e: React.FormEvent) {
    e.preventDefault();
    if (!alertTicker || !alertTargetValue) return;

    try {
      const res = await fetchWithAuth("/monitoring/rules", {
        method: "POST",
        body: JSON.stringify({
          ticker: alertTicker.toUpperCase().trim(),
          rule_type: alertRuleType,
          target_value: parseFloat(alertTargetValue) || 0,
          notes: alertNotes
        })
      });
      if (res.ok) {
        setAlertTicker("");
        setAlertTargetValue("");
        setAlertNotes("");
        const aRes = await fetchWithAuth("/monitoring/rules");
        if (aRes.ok) setAlerts(await aRes.json());
      }
    } catch (err: any) {
      alert("Erro ao criar regra: " + err.message);
    }
  }

  async function handleDeleteAlert(id: number) {
    try {
      const res = await fetchWithAuth(`/monitoring/rules/${id}`, { method: "DELETE" });
      if (res.ok) {
        setAlerts(alerts.filter(a => a.id !== id));
      }
    } catch (err: any) {
      console.error(err);
    }
  }

  async function handleCalculateSwap(e: React.FormEvent) {
    e.preventDefault();
    if (!swapSourceTicker || !swapTargetTicker || !swapCapital) return;

    try {
      const res = await fetchWithAuth("/monitoring/swap-analysis", {
        method: "POST",
        body: JSON.stringify({
          source_ticker: swapSourceTicker.toUpperCase().trim(),
          source_price: parseFloat(swapSourcePrice) || 1,
          source_yield_annual: parseFloat(swapSourceYield) || 0,
          target_ticker: swapTargetTicker.toUpperCase().trim(),
          target_price: parseFloat(swapTargetPrice) || 1,
          target_yield_annual: parseFloat(swapTargetYield) || 0,
          capital_amount: parseFloat(swapCapital) || 0
        })
      });
      if (res.ok) {
        const data = await res.json();
        setSwapResult(data);
      }
    } catch (err: any) {
      alert("Erro no cálculo de troca: " + err.message);
    }
  }

  async function handleAutoFetchReports() {
    setIsSummarizingReport(true);
    setReportFeedback("Buscando comunicados e relatórios recentes na CVM/B3 para todos os ativos em carteira...");
    try {
      const res = await fetchWithAuth("/monitoring/auto-fetch-reports", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setReportFeedback(`Aviso: ${data.detail || "Erro na busca automática"}`);
        return;
      }
      setReportFeedback(`Busca concluída! ${data.new_reports_count} novo(s) relatório(s) encontrado(s) e analisado(s) pelo Ollama.`);
      const rRes = await fetchWithAuth("/monitoring/reports");
      if (rRes.ok) setReports(await rRes.json());
    } catch (err: any) {
      setReportFeedback("Erro: " + err.message);
    } finally {
      setIsSummarizingReport(false);
    }
  }

  async function handleUploadReport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !reportTicker || !reportTitle) {
      alert("Preencha o Ticker e o Título do relatório antes de selecionar o PDF.");
      return;
    }

    setIsSummarizingReport(true);
    setReportFeedback("Enviando PDF e acionando IA (Ollama local)... isso pode levar cerca de 1 minuto.");
    const formData = new FormData();
    formData.append("ticker", reportTicker.toUpperCase().trim());
    formData.append("title", reportTitle);
    formData.append("file", file);

    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://api-financeira.leo.lyra.nom.br"}/api/v1/monitoring/reports/summarize`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        setReportFeedback(`Erro: ${data.detail || "Falha ao processar relatório"}`);
        return;
      }
      setReportFeedback(`Sucesso! Relatório de ${data.ticker} analisado pelo Ollama com sucesso.`);
      setReportTicker("");
      setReportTitle("");
      const rRes = await fetchWithAuth("/monitoring/reports");
      if (rRes.ok) setReports(await rRes.json());
    } catch (err: any) {
      setReportFeedback("Erro no envio: " + err.message);
    } finally {
      setIsSummarizingReport(false);
    }
  }

  // Funções de Investimentos
  async function handleCreateManualInvestment(e: React.FormEvent) {
    e.preventDefault();
    if (!invTicker) return;

    const q = parseFloat(invQty) || 0;
    const p = parseFloat(invUnitPrice) || 0;
    const c = parseFloat(invCosts) || 0;
    const total = (q * p) + (invOpType === "buy" ? c : -c);

    try {
      const res = await fetchWithAuth("/investments/transactions", {
        method: "POST",
        body: JSON.stringify({
          ticker: invTicker.toUpperCase().trim(),
          operation_type: invOpType,
          quantity: q,
          unit_price: p,
          costs: c,
          total_amount: total,
          trade_date: new Date(invDate).toISOString()
        })
      });
      if (res.ok) {
        setShowManualInvModal(false);
        setInvTicker("");
        setInvQty("");
        setInvUnitPrice("");
        setInvCosts("");
        loadAllData();
      }
    } catch (err: any) {
      alert("Erro ao salvar operação: " + err.message);
    }
  }

  async function handleUploadSinacor(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPdf(true);
    setInvUploadMsg("Processando nota de corretagem padrão Sinacor/B3...");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://api-financeira.leo.lyra.nom.br"}/api/v1/investments/upload-sinacor`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        setInvUploadMsg(`Erro: ${data.detail || "Falha ao processar nota"}`);
        return;
      }
      setInvUploadMsg(`Sucesso! Pregão de ${data.trade_date}: ${data.operations_imported} operações importadas com rateio de R$ ${data.total_costs} em taxas.`);
      loadAllData();
    } catch (err: any) {
      setInvUploadMsg("Erro no envio: " + err.message);
    } finally {
      setIsUploadingPdf(false);
    }
  }

  async function handleMigrateTicker(e: React.FormEvent) {
    e.preventDefault();
    if (!migrateOld || !migrateNew) return;
    setMigrateMsg("Atualizando histórico de tickers...");
    try {
      const res = await fetchWithAuth("/investments/migrate-ticker", {
        method: "POST",
        body: JSON.stringify({
          ticker_old: migrateOld.toUpperCase().trim(),
          ticker_new: migrateNew.toUpperCase().trim()
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setMigrateMsg(`Erro: ${data.detail || "Falha na migração"}`);
        return;
      }
      setMigrateMsg(`Sucesso! ${data.transactions_updated} lançamentos passados de ${data.ticker_old} foram atualizados para ${data.ticker_new}.`);
      setMigrateOld("");
      setMigrateNew("");
      loadAllData();
    } catch (err: any) {
      setMigrateMsg("Erro: " + err.message);
    }
  }

  // Ações de Transação
  async function handleCreateTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!newTxDesc || !newTxAmount || !newTxAccountId) return;

    const rawAmt = parseFloat(newTxAmount);
    const finalAmt = newTxType === 'expense' ? -Math.abs(rawAmt) : Math.abs(rawAmt);

    try {
      const res = await fetchWithAuth('/transactions/', {
        method: 'POST',
        body: JSON.stringify({
          account_id: Number(newTxAccountId),
          category_id: newTxCategoryId ? Number(newTxCategoryId) : null,
          description: newTxDesc,
          amount: finalAmt,
          date: new Date(newTxDate).toISOString(),
          is_manual: true
        })
      });

      if (res.ok) {
        const created = await res.json();
        setTransactions([created, ...transactions]);
        setNewTxDesc('');
        setNewTxAmount('');
        loadAllData(); // atualiza saldos e dashboard
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleUpdateCategory(txId: number, catId: number | null) {
    try {
      const res = await fetchWithAuth(`/transactions/${txId}/category`, {
        method: 'PATCH',
        body: JSON.stringify({ category_id: catId })
      });
      if (res.ok) {
        const updated = await res.json();
        setTransactions(transactions.map(t => t.id === txId ? updated : t));
        // Recarrega summary para atualizar gráficos
        const sumRes = await fetchWithAuth('/transactions/summary?days=90');
        if (sumRes.ok) setSummary(await sumRes.json());
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Contas
  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!newAccName) return;
    try {
      const res = await fetchWithAuth('/accounts/', {
        method: 'POST',
        body: JSON.stringify({
          name: newAccName,
          type: newAccType,
          balance: parseFloat(newAccBalance) || 0
        })
      });
      if (res.ok) {
        const created = await res.json();
        setAccounts([...accounts, created]);
        setNewAccName('');
        setNewAccBalance('');
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeleteAccount(id: number) {
    try {
      const res = await fetchWithAuth(`/accounts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAccounts(accounts.filter(a => a.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Categorias
  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatName) return;
    try {
      const res = await fetchWithAuth('/categories/', {
        method: 'POST',
        body: JSON.stringify({
          name: newCatName,
          type: newCatType,
          color: newCatColor
        })
      });
      if (res.ok) {
        const created = await res.json();
        setCategories([...categories, created]);
        setNewCatName('');
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDeleteCategory(id: number) {
    try {
      const res = await fetchWithAuth(`/categories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCategories(categories.filter(c => c.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Sincronizar por Item ID específico
  async function handleSyncSingleItem(itemIdToSync?: string) {
    const id = itemIdToSync || customItemId;
    if (!id) return;
    setIsConnectingPluggy(true);
    setPluggyStatusMsg(`Conectando ao banco (Item: ${id.slice(0, 8)}...)...`);
    try {
      const res = await fetchWithAuth("/open-finance/sync-item", {
        method: "POST",
        body: JSON.stringify({ itemId: id.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        setPluggyStatusMsg(`Aviso da Pluggy: ${data.detail || "Erro ao sincronizar"}`);
        return;
      }
      setPluggyStatusMsg(`Sincronização concluída! ${data.accounts_synced} conta(s) e ${data.transactions_synced} transações importadas.`);
      setCustomItemId("");
      setShowItemInput(false);
      loadAllData();
    } catch (err: any) {
      setPluggyStatusMsg("Erro ao sincronizar: " + err.message);
    } finally {
      setIsConnectingPluggy(false);
    }
  }

  async function handleOpenDiagnostics() {
    setIsLoadingDiagnostics(true);
    setPluggyStatusMsg('Consultando status detalhado das conexões na Pluggy...');
    try {
      const res = await fetchWithAuth('/open-finance/diagnostics');
      const data = await res.json();
      setDiagnosticsData(data);
      setShowDiagnosticsModal(true);
      setPluggyStatusMsg('Diagnóstico carregado com sucesso!');
    } catch (err: any) {
      setPluggyStatusMsg('Erro ao carregar diagnóstico: ' + err.message);
    } finally {
      setIsLoadingDiagnostics(false);
    }
  }

  // Sincronizar conexões já existentes no Pluggy
  async function handleSyncAllExisting() {
    setIsConnectingPluggy(true);
    setPluggyStatusMsg("Buscando todas as contas já autorizadas na Pluggy...");
    try {
      const res = await fetchWithAuth("/open-finance/sync-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setPluggyStatusMsg(`Aviso: ${data.detail || "Erro ao buscar conexões"}`);
        return;
      }
      if (data.notice) {
        setPluggyStatusMsg(data.notice);
      } else {
        const invMsg = data.investments_synced ? `, ${data.investments_synced} posições de investimento` : "";
        setPluggyStatusMsg(`Sincronização concluída! ${data.items_count} instituição(ões), ${data.accounts_synced} contas, ${data.transactions_synced} transações${invMsg} importadas.`);
      }
      loadAllData();
    } catch (err: any) {
      setPluggyStatusMsg("Erro ao sincronizar dados: " + err.message);
    } finally {
      setIsConnectingPluggy(false);
    }
  }

  // Conexão Open Finance via Pluggy Connect
  async function handleStartPluggyConnect() {
    setIsConnectingPluggy(true);
    setPluggyStatusMsg('Obtendo token de conexão seguro...');
    try {
      const res = await fetchWithAuth('/open-finance/connect-token', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setPluggyStatusMsg(`Aviso: Configure PLUGGY_CLIENT_ID e SECRET na API. Detalhe: ${data.detail || ''}`);
        return;
      }
      
      const connectToken = data.connectToken;
      setPluggyStatusMsg('Abrindo Pluggy Connect Widget...');

      // Carrega o script oficial do widget da Pluggy se não estiver presente
      if (!(window as any).PluggyConnect) {
        const script = document.createElement('script');
        script.src = 'https://cdn.pluggy.ai/pluggy-connect/v2.7.0/pluggy-connect.js';
        script.async = true;
        script.onload = () => launchPluggyWidget(connectToken);
        document.body.appendChild(script);
      } else {
        launchPluggyWidget(connectToken);
      }
    } catch (err: any) {
      setPluggyStatusMsg('Falha ao conectar com serviço Pluggy: ' + err.message);
    }
  }

  function launchPluggyWidget(connectToken: string) {
    const pluggyConnect = new (window as any).PluggyConnect({
      connectToken,
      // includeSandbox: false,
      onSuccess: async (itemData: any) => {
        setPluggyStatusMsg('Banco conectado! Sincronizando contas e extratos...');
        try {
          const syncRes = await fetchWithAuth('/open-finance/sync-item', {
            method: 'POST',
            body: JSON.stringify({ itemId: itemData.item.id })
          });
          const syncData = await syncRes.json();
          if (syncData.notice) {
            setPluggyStatusMsg(syncData.notice);
          } else {
            setPluggyStatusMsg(`Sincronização concluída! ${syncData.transactions_synced} lançamentos importados.`);
          }
          loadAllData();
        } catch (e: any) {
          setPluggyStatusMsg('Erro na sincronização: ' + e.message);
        }
      },
      onError: (error: any) => {
        setPluggyStatusMsg('Conexão cancelada ou erro: ' + error.message);
      },
      onClose: () => {
        setIsConnectingPluggy(false);
      }
    });
    pluggyConnect.init();
  }

  const totalChecking = accounts.filter(a => a.type !== 'credit_card').reduce((sum, acc) => sum + Number(acc.balance), 0);
  const totalCreditCards = accounts.filter(a => a.type === 'credit_card').reduce((sum, acc) => sum + Number(acc.balance), 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-slate-950">
        <div className="w-full max-w-md p-6 sm:p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-white tracking-tight">Gestão Financeira</h1>
            <p className="text-sm text-slate-400 mt-1">
              {isRegister ? 'Crie sua conta para começar' : 'Acesse seu painel pessoal'}
            </p>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-400 text-xs">
              {authError}
            </div>
          )}

          <form onSubmit={handleAuth} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                  placeholder="Ex: Leonardo Lyra"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">E-mail</label>
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Senha</label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-indigo-500"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm rounded-lg transition"
            >
              {isRegister ? 'Criar Conta' : 'Entrar'}
            </button>
          </form>

          <div className="text-center mt-6">
            <button
              onClick={() => { setIsRegister(!isRegister); setAuthError(''); }}
              className="text-xs text-indigo-400 hover:underline"
            >
              {isRegister ? 'Já possui uma conta? Faça login' : 'Não tem conta? Cadastre-se'}
            </button>
          </div>
        </div>
        {/* Modal de Diagnóstico Open Finance */}
      {showDiagnosticsModal && diagnosticsData && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full p-6 shadow-2xl my-8 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-400" /> Diagnóstico das Conexões Bancárias
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Dados retornados diretamente pela API da Pluggy para as suas contas conectadas
                </p>
              </div>
              <button
                onClick={() => setShowDiagnosticsModal(false)}
                className="text-slate-400 hover:text-white px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 rounded-lg transition"
              >
                ✕ Fechar
              </button>
            </div>

            {/* Resumo do Banco Local */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                <span className="text-[11px] text-slate-400 block">Contas Correntes</span>
                <span className="text-lg font-semibold text-white">{diagnosticsData.database_summary?.checking_accounts || 0}</span>
              </div>
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                <span className="text-[11px] text-slate-400 block">Cartões de Crédito</span>
                <span className="text-lg font-semibold text-indigo-400">{diagnosticsData.database_summary?.credit_cards || 0}</span>
              </div>
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                <span className="text-[11px] text-slate-400 block">Transações Salvas</span>
                <span className="text-lg font-semibold text-emerald-400">{diagnosticsData.database_summary?.transactions_count || 0}</span>
              </div>
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                <span className="text-[11px] text-slate-400 block">Posições Investimentos</span>
                <span className="text-lg font-semibold text-amber-400">{diagnosticsData.database_summary?.investments_count || 0}</span>
              </div>
            </div>

            {/* Lista de Itens Conectados */}
            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Instituições Encontradas ({diagnosticsData.total_items_found || 0})
              </h4>

              {(!diagnosticsData.items || diagnosticsData.items.length === 0) && (
                <div className="p-4 bg-slate-800/40 rounded-xl text-center text-xs text-slate-400">
                  Nenhuma conexão com itemId encontrado. Clique em "Nova Conexão" para autorizar seu banco.
                </div>
              )}

              {diagnosticsData.items?.map((it: any, idx: number) => (
                <div key={idx} className="p-4 bg-slate-800/50 border border-slate-700/70 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-bold text-white text-sm">{it.connector_name}</span>
                      <span className="text-[10px] text-slate-500 block font-mono">ID: {it.item_id}</span>
                    </div>
                    <span className={}>
                      {it.status || 'OK'}
                    </span>
                  </div>

                  {/* Contas do banco */}
                  <div>
                    <span className="text-[11px] font-medium text-slate-300 block mb-1">Contas e Cartões Retornados:</span>
                    <div className="space-y-1.5">
                      {it.accounts?.map((acc: any, aidx: number) => (
                        <div key={aidx} className="flex justify-between items-center text-xs p-2 bg-slate-900/60 rounded border border-slate-800">
                          <div>
                            <span className="text-slate-200 font-medium">{acc.name}</span>
                            <span className="text-[10px] text-slate-400 ml-2">({acc.type} / {acc.subtype})</span>
                            {acc.bills_found > 0 && (
                              <span className="text-[10px] text-indigo-400 ml-2 font-medium">· {acc.bills_found} fatura(s)</span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-slate-200 font-medium">R$ {Number(acc.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            <span className="text-[10px] text-slate-400 block">{acc.transactions_found} transação(ões)</span>
                          </div>
                        </div>
                      ))}
                      {(!it.accounts || it.accounts.length === 0) && (
                        <p className="text-[11px] text-slate-500 italic">Nenhuma conta retornada para esta instituição.</p>
                      )}
                    </div>
                  </div>

                  {/* Investimentos do banco */}
                  <div>
                    <span className="text-[11px] font-medium text-slate-300 block mb-1">
                      Investimentos Retornados ({it.investments?.length || 0}):
                    </span>
                    {it.investments?.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                        {it.investments.map((inv: any, iidx: number) => (
                          <div key={iidx} className="p-2 bg-slate-900/60 rounded border border-slate-800 text-xs">
                            <div className="font-semibold text-slate-200">{inv.name || inv.code}</div>
                            <div className="text-[10px] text-slate-400 flex justify-between mt-0.5">
                              <span>{inv.type || inv.subtype}</span>
                              <span className="text-emerald-400 font-medium">R$ {Number(inv.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-400/80 bg-amber-500/10 p-2 rounded border border-amber-500/20">
                        O banco não retornou investimentos nesta conexão. Se você possui investimentos nesta instituição, verifique se a opção "Investimentos" foi marcada na autorização do app bancário.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => {
                  setShowDiagnosticsModal(false);
                  handleSyncAllExisting();
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow transition"
              >
                Sincronizar Todas Agora
              </button>
            </div>
          </div>
        </div>
      )}
    </main>

    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-800 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
            Painel Financeiro
          </h1>
          <p className="text-sm text-slate-400">
            Bem-vindo, <strong className="text-slate-200">{user?.name}</strong>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSyncAllExisting}
            disabled={isConnectingPluggy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium shadow transition disabled:opacity-50"
            title="Sincronizar todas as contas bancárias já autorizadas no Open Finance"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isConnectingPluggy ? "animate-spin" : ""}`} /> Sincronizar Contas Cadastradas
          </button>
          <button
            onClick={handleOpenDiagnostics}
            disabled={isLoadingDiagnostics}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-medium shadow transition disabled:opacity-50"
            title="Verificar permissões e itens retornados por cada banco"
          >
            <AlertCircle className={`w-3.5 h-3.5 ${isLoadingDiagnostics ? "animate-spin" : ""}`} /> Diagnóstico Conexões
          </button>
          <button
            onClick={() => setShowItemInput(!showItemInput)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
            title="Sincronizar informando o Item ID manualmente"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" /> Item ID Manual
          </button>
          <button
            onClick={handleStartPluggyConnect}
            disabled={isConnectingPluggy}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium shadow transition disabled:opacity-50"
          >
            <Landmark className="w-3.5 h-3.5" /> Nova Conexão
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg text-xs transition"
          >
            <LogOut className="w-3.5 h-3.5" /> Sair
          </button>
        </div>
      </header>

      {/* Caixa de Entrada de Item ID da Pluggy */}
      {showItemInput && (
        <div className="mt-4 p-4 bg-slate-900 border border-indigo-500/30 rounded-xl shadow-lg">
          <h3 className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5">
            <Landmark className="w-4 h-4 text-indigo-400" /> Sincronizar Banco Conectado (Pluggy)
          </h3>
          <p className="text-[11px] text-slate-400 mb-3">
            Cole abaixo o <strong>Item ID</strong> da sua conexão no painel da Pluggy (ex: a conexão do Banco Inter).
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              placeholder="Cole o Item ID aqui (ex: e84d2b1a-8c34-4a21-...)"
              value={customItemId}
              onChange={(e) => setCustomItemId(e.target.value)}
              className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
            />
            <button
              onClick={() => handleSyncSingleItem()}
              disabled={isConnectingPluggy || !customItemId}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition disabled:opacity-50 whitespace-nowrap"
            >
              {isConnectingPluggy ? "Importando..." : "Importar Contas & Extratos"}
            </button>
          </div>
        </div>
      )}

      {/* Mensagens de status do Open Finance */}
      {pluggyStatusMsg && (
        <div className="mt-4 p-3 bg-indigo-950/50 border border-indigo-800/50 rounded-xl text-xs text-indigo-200 flex justify-between items-center">
          <span>{pluggyStatusMsg}</span>
          <button onClick={() => setPluggyStatusMsg('')} className="text-indigo-400 hover:underline text-[10px]">Fechar</button>
        </div>
      )}

      {/* Tabs Responsivas */}
      <nav className="flex space-x-2 border-b border-slate-800 mt-6 overflow-x-auto pb-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-4 h-4" /> Visão Geral & Dashboards
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition whitespace-nowrap ${
            activeTab === 'transactions'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" /> Lançamentos / Extrato ({transactions.length})
        </button>
        <button
          onClick={() => setActiveTab('investments')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition whitespace-nowrap ${
            activeTab === 'investments'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <TrendingUp className="w-4 h-4" /> Investimentos & Carteira ({portfolio.length})
        </button>
        <button
          onClick={() => setActiveTab('monitoring')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition whitespace-nowrap ${
            activeTab === 'monitoring'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-400" /> Monitoramento & IA ({alerts.length})
        </button>
        <button
          onClick={() => setActiveTab('accounts')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition whitespace-nowrap ${
            activeTab === 'accounts'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <Building2 className="w-4 h-4" /> Contas & Cartões ({accounts.length})
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition whitespace-nowrap ${
            activeTab === 'categories'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <Tag className="w-4 h-4" /> Categorias ({categories.length})
        </button>
      </nav>

      {/* ABA 1: VISÃO GERAL & DASHBOARDS */}
      {activeTab === 'overview' && (
        <section className="mt-6 space-y-6">
          {/* Cards Principais */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-xs font-medium uppercase tracking-wider">Saldo em Contas</span>
                <Wallet className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-white">
                  R$ {totalChecking.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <p className="text-[11px] text-slate-500 mt-1">Líquido disponível</p>
              </div>
            </div>

            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-xs font-medium uppercase tracking-wider">Faturas de Cartão</span>
                <CreditCard className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-amber-400">
                  R$ {Math.abs(totalCreditCards).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <p className="text-[11px] text-slate-500 mt-1">Compromisso em aberto</p>
              </div>
            </div>

            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-xs font-medium uppercase tracking-wider">Receitas (90d)</span>
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-emerald-400">
                  R$ {Number(summary?.total_income || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <p className="text-[11px] text-slate-500 mt-1">Entradas consolidadas</p>
              </div>
            </div>

            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-xs font-medium uppercase tracking-wider">Despesas (90d)</span>
                <ArrowDownRight className="w-4 h-4 text-rose-400" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-rose-400">
                  R$ {Number(summary?.total_expense || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <p className="text-[11px] text-slate-500 mt-1">Saídas e pagamentos</p>
              </div>
            </div>
          </div>

          {/* Gráficos e Distribuição */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Distribuição por Categoria */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Tag className="w-4 h-4 text-indigo-400" /> Composição de Gastos por Categoria (Últimos 90 dias)
              </h3>
              <div className="space-y-3">
                {summary?.expenses_by_category.map((cat) => {
                  const percent = summary.total_expense > 0 ? (Number(cat.value) / Number(summary.total_expense)) * 100 : 0;
                  return (
                    <div key={cat.name} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 font-medium">{cat.name}</span>
                        <span className="text-slate-400">
                          R$ {Number(cat.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({percent.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${percent}%`,
                            backgroundColor: cat.color || '#3b82f6'
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
                {(!summary || summary.expenses_by_category.length === 0) && (
                  <p className="text-xs text-slate-500 py-6 text-center">Nenhuma despesa registrada no período.</p>
                )}
              </div>
            </div>

            {/* Evolução Mensal */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> Histórico Mensal (Receitas vs Despesas)
              </h3>
              <div className="space-y-4">
                {summary?.monthly_trend.map((m) => {
                  const inc = Number(m.income);
                  const exp = Number(m.expense);
                  const maxVal = Math.max(inc, exp, 1);
                  return (
                    <div key={m.month} className="p-3 bg-slate-800/40 border border-slate-800 rounded-lg">
                      <div className="flex justify-between text-xs font-semibold mb-2">
                        <span className="text-slate-200">{m.month}</span>
                        <span className={inc >= exp ? 'text-emerald-400' : 'text-rose-400'}>
                          Líquido: R$ {(inc - exp).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="w-16 text-slate-400">Receitas</span>
                          <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(inc / maxVal) * 100}%` }} />
                          </div>
                          <span className="w-24 text-right text-emerald-400">R$ {inc.toFixed(2)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="w-16 text-slate-400">Despesas</span>
                          <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-rose-500 rounded-full" style={{ width: `${(exp / maxVal) * 100}%` }} />
                          </div>
                          <span className="w-24 text-right text-rose-400">R$ {exp.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(!summary || summary.monthly_trend.length === 0) && (
                  <p className="text-xs text-slate-500 py-6 text-center">Nenhum dado mensal registrado.</p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ABA 2: LANÇAMENTOS & EXTRATO */}
      {activeTab === 'transactions' && (
        <section className="mt-6 space-y-6">
          {/* Formulário de Novo Lançamento Manual */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
            <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-indigo-400" /> Registrar Novo Lançamento Manual
            </h2>
            <form onSubmit={handleCreateTransaction} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div className="lg:col-span-2">
                <input
                  type="text"
                  placeholder="Descrição (ex: Supermercado, Aluguel)"
                  value={newTxDesc}
                  onChange={(e) => setNewTxDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <select
                  value={newTxType}
                  onChange={(e) => setNewTxType(e.target.value as 'expense' | 'income')}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="expense">Despesa (-)</option>
                  <option value="income">Receita (+)</option>
                </select>
              </div>

              <div>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Valor (R$)"
                  value={newTxAmount}
                  onChange={(e) => setNewTxAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <select
                  value={newTxAccountId}
                  onChange={(e) => setNewTxAccountId(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                >
                  <option value="">Selecione a Conta</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>

              <div>
                <select
                  value={newTxCategoryId}
                  onChange={(e) => setNewTxCategoryId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Autocategorizar</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="sm:col-span-2 lg:col-span-6 flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition"
                >
                  Salvar Lançamento
                </button>
              </div>
            </form>
          </div>

          {/* Tabela de Lançamentos com Reclassificação Rápida */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Extrato Consolidado de Transações</h3>
              <span className="text-xs text-slate-400">{transactions.length} registros</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Data</th>
                    <th className="py-3 px-4">Descrição</th>
                    <th className="py-3 px-4">Conta</th>
                    <th className="py-3 px-4">Categoria</th>
                    <th className="py-3 px-4 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {transactions.map((tx) => {
                    const isIncome = Number(tx.amount) > 0;
                    return (
                      <tr key={tx.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-4 text-xs whitespace-nowrap text-slate-400">
                          {new Date(tx.date).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="py-3 px-4 font-medium text-white">
                          <div className="flex items-center gap-2">
                            <span>{tx.description}</span>
                            {!tx.is_manual && (
                              <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 text-[10px] rounded border border-emerald-500/20">
                                Open Finance
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-400 whitespace-nowrap">
                          {tx.account_name || 'Conta Padrão'}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <select
                            value={tx.category_id || ''}
                            onChange={(e) => handleUpdateCategory(tx.id, e.target.value ? Number(e.target.value) : null)}
                            className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                          >
                            <option value="">Sem Categoria</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className={`py-3 px-4 text-right font-bold whitespace-nowrap ${isIncome ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isIncome ? '+' : ''} R$ {Number(tx.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                        Nenhum lançamento registrado. Conecte seu banco via Open Finance ou insira lançamentos manuais acima.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ABA INVESTIMENTOS & CARTEIRA */}
      {activeTab === 'investments' && (
        <section className="mt-6 space-y-6">
          {/* Cards de Métricas de Investimento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-xs font-medium uppercase tracking-wider">Patrimônio em Custódia</span>
                <PieChart className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-white">
                  R$ {Number(invSummary?.total_equity_invested || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <p className="text-[11px] text-slate-500 mt-1">{invSummary?.positions_count || 0} ativos em carteira</p>
              </div>
            </div>

            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-xs font-medium uppercase tracking-wider">Proventos Recebidos</span>
                <ArrowUpRight className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-indigo-400">
                  R$ {Number(invSummary?.total_dividends_received || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <p className="text-[11px] text-slate-500 mt-1">Dividendos, JCP e Rendimentos</p>
              </div>
            </div>

            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-xs font-medium uppercase tracking-wider">Ganho de Capital (Mês)</span>
                <TrendingUp className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-3">
                <span className={`text-2xl font-bold ${Number(invSummary?.monthly_capital_gain || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  R$ {Number(invSummary?.monthly_capital_gain || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <p className="text-[11px] text-slate-500 mt-1">Resultado de vendas fechadas</p>
              </div>
            </div>

            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-xs font-medium uppercase tracking-wider">Ações de Importação</span>
                <UploadCloud className="w-4 h-4 text-blue-400" />
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                <label className="cursor-pointer text-center px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition">
                  {isUploadingPdf ? "Lendo Nota..." : "Importar Nota PDF (Sinacor)"}
                  <input type="file" accept=".pdf" onChange={handleUploadSinacor} className="hidden" />
                </label>
                <button
                  onClick={() => setShowMigrateModal(!showMigrateModal)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
                >
                  Migrar Ticker (De/Para)
                </button>
              </div>
            </div>
          </div>

          {/* Mensagem de Feedback de Upload */}
          {invUploadMsg && (
            <div className="p-3 bg-indigo-950/60 border border-indigo-800/50 rounded-xl text-xs text-indigo-200 flex justify-between items-center">
              <span>{invUploadMsg}</span>
              <button onClick={() => setInvUploadMsg("")} className="text-indigo-400 hover:underline text-[10px]">Fechar</button>
            </div>
          )}

          {/* Modal / Caixa de Migração de Ticker */}
          {showMigrateModal && (
            <div className="p-5 bg-slate-900 border border-indigo-500/30 rounded-xl">
              <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-indigo-400" /> Atualizar / Migrar Ticker Histórico
              </h3>
              <p className="text-xs text-slate-400 mb-3">
                Atualiza todos os lançamentos passados de um ticker que mudou de código (ex: fusão ou cisão), preservando o preço médio e histórico contábil.
              </p>
              <form onSubmit={handleMigrateTicker} className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Ticker Antigo (ex: HGLG11)"
                  value={migrateOld}
                  onChange={(e) => setMigrateOld(e.target.value)}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white uppercase focus:outline-none focus:border-indigo-500 font-mono"
                  required
                />
                <input
                  type="text"
                  placeholder="Novo Ticker (ex: ALZR11)"
                  value={migrateNew}
                  onChange={(e) => setMigrateNew(e.target.value)}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white uppercase focus:outline-none focus:border-indigo-500 font-mono"
                  required
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition whitespace-nowrap"
                >
                  Atualizar Histórico
                </button>
              </form>
              {migrateMsg && <p className="text-xs text-emerald-400 mt-2">{migrateMsg}</p>}
            </div>
          )}

          {/* Botão para Nova Operação Manual */}
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-white">Custódia Consolidada da Carteira</h3>
            <button
              onClick={() => setShowManualInvModal(!showManualInvModal)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white rounded-lg text-xs font-medium transition"
            >
              <PlusCircle className="w-3.5 h-3.5 text-indigo-400" /> Nova Operação Manual
            </button>
          </div>

          {/* Form Operação Manual */}
          {showManualInvModal && (
            <form onSubmit={handleCreateManualInvestment} className="p-4 bg-slate-900 border border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <input
                type="text"
                placeholder="Ticker (ex: PETR4, BBAS3)"
                value={invTicker}
                onChange={(e) => setInvTicker(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white uppercase font-mono"
                required
              />
              <select
                value={invOpType}
                onChange={(e) => setInvOpType(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
              >
                <option value="buy">Compra</option>
                <option value="sell">Venda</option>
                <option value="dividend">Dividendo</option>
                <option value="jcp">Juros s/ Cap. Próprio (JCP)</option>
                <option value="rendimento">Rendimento FII</option>
              </select>
              <input
                type="number"
                step="any"
                placeholder="Quantidade"
                value={invQty}
                onChange={(e) => setInvQty(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                required
              />
              <input
                type="number"
                step="0.01"
                placeholder="Preço Unitário (R$)"
                value={invUnitPrice}
                onChange={(e) => setInvUnitPrice(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                required
              />
              <input
                type="number"
                step="0.01"
                placeholder="Custos / Taxas (R$)"
                value={invCosts}
                onChange={(e) => setInvCosts(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition"
              >
                Salvar Operação
              </button>
            </form>
          )}

          {/* Tabela de Custódia */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Ticker</th>
                    <th className="py-3 px-4">Ativo</th>
                    <th className="py-3 px-4">Tipo</th>
                    <th className="py-3 px-4 text-right">Qtd</th>
                    <th className="py-3 px-4 text-right">Preço Médio</th>
                    <th className="py-3 px-4 text-right">Total Investido</th>
                    <th className="py-3 px-4 text-right">Proventos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {portfolio.map((pos) => (
                    <tr key={pos.asset_id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 font-bold text-white font-mono">{pos.ticker}</td>
                      <td className="py-3 px-4 text-xs text-slate-300">{pos.name}</td>
                      <td className="py-3 px-4 text-xs">
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                          {pos.asset_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-xs font-mono">{Number(pos.quantity).toLocaleString('pt-BR')}</td>
                      <td className="py-3 px-4 text-right text-xs font-mono">R$ {Number(pos.average_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="py-3 px-4 text-right text-xs font-bold text-white font-mono">
                        R$ {Number(pos.total_invested).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right text-xs font-semibold text-emerald-400 font-mono">
                        R$ {Number(pos.total_dividends).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {portfolio.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                        Nenhum ativo em carteira. Importe uma nota de corretagem em PDF (Sinacor) ou registre operações manuais.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Histórico Recente de Operações */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Histórico de Operações e Proventos</h3>
              <span className="text-xs text-slate-400">{invTransactions.length} registros</span>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-4">Data</th>
                    <th className="py-2.5 px-4">Ticker</th>
                    <th className="py-2.5 px-4">Operação</th>
                    <th className="py-2.5 px-4 text-right">Qtd</th>
                    <th className="py-2.5 px-4 text-right">Preço Unit.</th>
                    <th className="py-2.5 px-4 text-right">Taxas</th>
                    <th className="py-2.5 px-4 text-right">Total</th>
                    <th className="py-2.5 px-4">Origem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {invTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 whitespace-nowrap text-slate-400">
                        {new Date(tx.trade_date).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-white font-mono">{tx.ticker}</td>
                      <td className="py-2.5 px-4">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          tx.operation_type === 'buy' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          tx.operation_type === 'sell' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                          'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                        }`}>
                          {tx.operation_type === 'buy' ? 'Compra' : tx.operation_type === 'sell' ? 'Venda' : tx.operation_type}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono">{Number(tx.quantity).toLocaleString('pt-BR')}</td>
                      <td className="py-2.5 px-4 text-right font-mono">R$ {Number(tx.unit_price).toFixed(2)}</td>
                      <td className="py-2.5 px-4 text-right text-slate-400 font-mono">R$ {Number(tx.costs).toFixed(2)}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-white font-mono">
                        R$ {Number(tx.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-4 text-[10px] text-slate-400">
                        {tx.source === 'pdf_sinacor' ? 'Nota B3 PDF' : tx.source === 'spreadsheet' ? 'Planilha' : 'Manual'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ABA MONITORAMENTO & IA (OLLAMA) */}
      {activeTab === 'monitoring' && (
        <section className="mt-6 space-y-8">
          {/* SEÇÃO 1: REGRAS DE MONITORAMENTO */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Target className="w-5 h-5 text-indigo-400" /> Regras de Monitoramento de Ativos
                </h2>
                <p className="text-xs text-slate-400">
                  Defina preço-teto de compra, preço-alvo de venda, dividend yield mínimo ou P/VP máximo.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateAlert} className="p-4 bg-slate-900 border border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <input
                type="text"
                placeholder="Ticker (ex: BBAS3, B5P211)"
                value={alertTicker}
                onChange={(e) => setAlertTicker(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white uppercase font-mono"
                required
              />
              <select
                value={alertRuleType}
                onChange={(e) => setAlertRuleType(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
              >
                <option value="target_price_buy">Preço-Teto de Compra (R$)</option>
                <option value="target_price_sell">Preço-Alvo de Venda (R$)</option>
                <option value="min_yield">Dividend Yield Mínimo (%)</option>
                <option value="max_pvp">P/VP Máximo Aceitável</option>
              </select>
              <input
                type="number"
                step="0.01"
                placeholder="Valor Alvo"
                value={alertTargetValue}
                onChange={(e) => setAlertTargetValue(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                required
              />
              <input
                type="text"
                placeholder="Observação (opcional)"
                value={alertNotes}
                onChange={(e) => setAlertNotes(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition"
              >
                Adicionar Regra
              </button>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {alerts.map((a) => (
                <div key={a.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm font-mono">{a.ticker}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                        {a.rule_type === "target_price_buy" ? "Preço Compra" :
                         a.rule_type === "target_price_sell" ? "Preço Venda" :
                         a.rule_type === "min_yield" ? "Yield Mínimo" : "P/VP Máximo"}
                      </span>
                    </div>
                    <div className="mt-2 text-xs">
                      <span className="text-slate-400">Meta: </span>
                      <strong className="text-white font-mono">
                        {a.rule_type.includes("price") ? `R$ ${Number(a.target_value).toFixed(2)}` :
                         a.rule_type === "min_yield" ? `${Number(a.target_value)}% a.a.` :
                         Number(a.target_value).toFixed(2)}
                      </strong>
                    </div>
                    {a.notes && <p className="text-[11px] text-slate-500 mt-1">{a.notes}</p>}
                  </div>
                  <button
                    onClick={() => handleDeleteAlert(a.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {alerts.length === 0 && (
                <p className="text-xs text-slate-500 col-span-full py-4 text-center">
                  Nenhuma regra de monitoramento cadastrada. Adicione alertas acima.
                </p>
              )}
            </div>
          </div>

          {/* SEÇÃO 2: OTIMIZADOR DE PROVENTOS / SUGESTÃO DE TROCA */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-emerald-400" /> Otimizador de Proventos (Sugestão de Troca de Ativos)
              </h2>
              <p className="text-xs text-slate-400">
                Calcule o ganho de fluxo de dividendos transferindo o mesmo montante financeiro entre dois ativos.
              </p>
            </div>

            <form onSubmit={handleCalculateSwap} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
              <input
                type="text"
                placeholder="Ativo Origem (ex: HGLG11)"
                value={swapSourceTicker}
                onChange={(e) => setSwapSourceTicker(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white uppercase font-mono"
                required
              />
              <input
                type="number"
                step="0.01"
                placeholder="Cotação Origem (R$)"
                value={swapSourcePrice}
                onChange={(e) => setSwapSourcePrice(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                required
              />
              <input
                type="number"
                step="0.01"
                placeholder="DY Anual Origem (%)"
                value={swapSourceYield}
                onChange={(e) => setSwapSourceYield(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                required
              />
              <input
                type="text"
                placeholder="Ativo Destino (ex: BTLG11)"
                value={swapTargetTicker}
                onChange={(e) => setSwapTargetTicker(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white uppercase font-mono"
                required
              />
              <input
                type="number"
                step="0.01"
                placeholder="Cotação Destino (R$)"
                value={swapTargetPrice}
                onChange={(e) => setSwapTargetPrice(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                required
              />
              <input
                type="number"
                step="0.01"
                placeholder="DY Anual Destino (%)"
                value={swapTargetYield}
                onChange={(e) => setSwapTargetYield(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                required
              />
              <div className="sm:col-span-2 lg:col-span-1">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Valor Aplicado (R$)"
                  value={swapCapital}
                  onChange={(e) => setSwapCapital(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                  required
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-7 flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition"
                >
                  Simular Otimização de Proventos
                </button>
              </div>
            </form>

            {swapResult && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3 bg-slate-900/60 rounded-lg">
                  <span className="text-[11px] text-slate-400">Ativo Atual ({swapResult.source.ticker})</span>
                  <div className="mt-1 font-mono">
                    <p className="text-sm text-white">{swapResult.source.shares_to_sell} cotas (R$ {swapResult.source.price})</p>
                    <p className="text-xs text-slate-300 mt-1">Rendimento: <strong>R$ {swapResult.source.monthly_income.toFixed(2)}/mês</strong></p>
                    <p className="text-[10px] text-slate-500">DY Anual: {swapResult.source.dividend_yield_annual}%</p>
                  </div>
                </div>

                <div className="p-3 bg-slate-900/60 rounded-lg border border-indigo-500/20">
                  <span className="text-[11px] text-indigo-400">Ativo Sugerido ({swapResult.target.ticker})</span>
                  <div className="mt-1 font-mono">
                    <p className="text-sm text-white">{swapResult.target.shares_to_buy} cotas (R$ {swapResult.target.price})</p>
                    <p className="text-xs text-emerald-400 mt-1">Rendimento: <strong>R$ {swapResult.target.monthly_income.toFixed(2)}/mês</strong></p>
                    <p className="text-[10px] text-slate-500">DY Anual: {swapResult.target.dividend_yield_annual}%</p>
                  </div>
                </div>

                <div className="p-3 bg-slate-900/60 rounded-lg flex flex-col justify-center">
                  <span className="text-[11px] text-emerald-400 uppercase font-semibold tracking-wider">Ganho Adicional Estimado</span>
                  <div className="mt-1">
                    <p className="text-xl font-bold text-emerald-400 font-mono">
                      + R$ {swapResult.comparison.monthly_cashflow_increase.toFixed(2)}/mês
                    </p>
                    <p className="text-xs text-slate-300 mt-0.5">
                      +{swapResult.comparison.percentage_increase}% de fluxo financeiro
                    </p>
                    <span className="inline-block mt-2 px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[10px]">
                      {swapResult.comparison.recommendation}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SEÇÃO 3: CENTRAL DE RELATÓRIOS & IA (OLLAMA LOCAL) */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Bot className="w-5 h-5 text-indigo-400" /> Inteligência de Relatórios (Ollama Local)
                </h2>
                <p className="text-xs text-slate-400">
                  Envie o relatório gerencial em PDF da gestora ou fato relevante para o Ollama extrair os pontos cruciais.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Ticker do Ativo (ex: BTLG11, PETR4)"
                  value={reportTicker}
                  onChange={(e) => setReportTicker(e.target.value)}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white uppercase font-mono"
                />
                <input
                  type="text"
                  placeholder="Título (ex: Relatório Gerencial Julho/2026)"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                />
                <label className="cursor-pointer text-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5">
                  <UploadCloud className="w-4 h-4" />
                  {isSummarizingReport ? "Processando..." : "Upload Manual de PDF"}
                  <input type="file" accept=".pdf" onChange={handleUploadReport} disabled={isSummarizingReport} className="hidden" />
                </label>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleAutoFetchReports}
                  disabled={isSummarizingReport}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg shadow transition flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSummarizingReport ? "animate-spin" : ""}`} />
                  {isSummarizingReport ? "Buscando e Resumindo com Ollama..." : "Buscar Novos Relatórios da Carteira (Automático)"}
                </button>
              </div>

              {reportFeedback && (
                <div className="p-3 bg-slate-950 border border-indigo-500/30 rounded-lg text-xs text-indigo-200">
                  {reportFeedback}
                </div>
              )}
            </div>

            {/* Lista de Relatórios com Análise de IA */}
            <div className="space-y-4">
              {reports.map((rep) => (
                <div key={rep.id} className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-3">
                  <div className="flex justify-between items-start border-b border-slate-800 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white font-mono text-sm">{rep.ticker}</span>
                        <h3 className="text-sm font-semibold text-slate-200">{rep.title}</h3>
                      </div>
                      <span className="text-[10px] text-slate-500">
                        Analisado em {new Date(rep.created_at).toLocaleDateString('pt-BR')} via Ollama local
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-sans bg-slate-950 p-4 rounded-lg border border-slate-850">
                    {rep.ai_summary}
                  </div>
                </div>
              ))}
              {reports.length === 0 && (
                <p className="text-xs text-slate-500 py-6 text-center">
                  Nenhum relatório analisado ainda. Faça upload de um relatório gerencial em PDF para a IA resumir.
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ABA 3: CONTAS E CARTÕES */}
      {activeTab === 'accounts' && (
        <section className="mt-6 space-y-6">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <PlusCircle className="w-4 h-4 text-indigo-400" /> Adicionar Nova Conta ou Cartão
              </h2>
              <button
                type="button"
                onClick={handleSyncAllExisting}
                disabled={isConnectingPluggy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium shadow transition disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isConnectingPluggy ? "animate-spin" : ""}`} /> Sincronizar Contas Cadastradas (Open Finance)
              </button>
            </div>
            <form onSubmit={handleCreateAccount} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Nome da Conta (ex: Banco Inter)"
                value={newAccName}
                onChange={(e) => setNewAccName(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                required
              />
              <select
                value={newAccType}
                onChange={(e) => setNewAccType(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="checking">Conta Corrente</option>
                <option value="credit_card">Cartão de Crédito</option>
                <option value="investment">Conta Investimento</option>
              </select>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  placeholder="Saldo Inicial (R$)"
                  value={newAccBalance}
                  onChange={(e) => setNewAccBalance(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition whitespace-nowrap"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((acc) => (
              <div key={acc.id} className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-slate-800 rounded-lg text-slate-300">
                    {acc.type === 'credit_card' ? <CreditCard className="w-5 h-5 text-amber-400" /> : <Wallet className="w-5 h-5 text-indigo-400" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm">{acc.name}</h3>
                    <span className="text-xs text-slate-400 capitalize">
                      {acc.type === 'checking' ? 'Conta Corrente' : acc.type === 'credit_card' ? 'Cartão de Crédito' : 'Investimento'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold ${acc.type === 'credit_card' ? 'text-amber-400' : 'text-white'}`}>
                    R$ {Number(acc.balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <button
                    onClick={() => handleDeleteAccount(acc.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 rounded transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ABA 4: CATEGORIAS */}
      {activeTab === 'categories' && (
        <section className="mt-6 space-y-6">
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-indigo-400" /> Nova Categoria Personalizada
            </h2>
            <form onSubmit={handleCreateCategory} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Nome da Categoria"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                required
              />
              <select
                value={newCatType}
                onChange={(e) => setNewCatType(e.target.value)}
                className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
              </select>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={newCatColor}
                  onChange={(e) => setNewCatColor(e.target.value)}
                  className="w-10 h-10 bg-transparent rounded cursor-pointer border border-slate-700"
                />
                <button
                  type="submit"
                  className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition"
                >
                  Criar Categoria
                </button>
              </div>
            </form>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {categories.map((cat) => (
              <div
                key={cat.id}
                className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex justify-between items-center"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: cat.color || '#3b82f6' }}
                  />
                  <div>
                    <p className="text-sm font-medium text-white">{cat.name}</p>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                      {cat.type === 'expense' ? 'Despesa' : 'Receita'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteCategory(cat.id)}
                  className="p-1 text-slate-500 hover:text-rose-400 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      {/* Modal de Diagnóstico Open Finance */}
      {showDiagnosticsModal && diagnosticsData && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full p-6 shadow-2xl my-8 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-amber-400" /> Diagnóstico das Conexões Bancárias
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Dados retornados diretamente pela API da Pluggy para as suas contas conectadas
                </p>
              </div>
              <button
                onClick={() => setShowDiagnosticsModal(false)}
                className="text-slate-400 hover:text-white px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 rounded-lg transition"
              >
                ✕ Fechar
              </button>
            </div>

            {/* Resumo do Banco Local */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                <span className="text-[11px] text-slate-400 block">Contas Correntes</span>
                <span className="text-lg font-semibold text-white">{diagnosticsData.database_summary?.checking_accounts || 0}</span>
              </div>
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                <span className="text-[11px] text-slate-400 block">Cartões de Crédito</span>
                <span className="text-lg font-semibold text-indigo-400">{diagnosticsData.database_summary?.credit_cards || 0}</span>
              </div>
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                <span className="text-[11px] text-slate-400 block">Transações Salvas</span>
                <span className="text-lg font-semibold text-emerald-400">{diagnosticsData.database_summary?.transactions_count || 0}</span>
              </div>
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50">
                <span className="text-[11px] text-slate-400 block">Posições Investimentos</span>
                <span className="text-lg font-semibold text-amber-400">{diagnosticsData.database_summary?.investments_count || 0}</span>
              </div>
            </div>

            {/* Lista de Itens Conectados */}
            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Instituições Encontradas ({diagnosticsData.total_items_found || 0})
              </h4>

              {(!diagnosticsData.items || diagnosticsData.items.length === 0) && (
                <div className="p-4 bg-slate-800/40 rounded-xl text-center text-xs text-slate-400">
                  Nenhuma conexão com itemId encontrado. Clique em "Nova Conexão" para autorizar seu banco.
                </div>
              )}

              {diagnosticsData.items?.map((it: any, idx: number) => (
                <div key={idx} className="p-4 bg-slate-800/50 border border-slate-700/70 rounded-xl space-y-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-bold text-white text-sm">{it.connector_name}</span>
                      <span className="text-[10px] text-slate-500 block font-mono">ID: {it.item_id}</span>
                    </div>
                    <span className={}>
                      {it.status || 'OK'}
                    </span>
                  </div>

                  {/* Contas do banco */}
                  <div>
                    <span className="text-[11px] font-medium text-slate-300 block mb-1">Contas e Cartões Retornados:</span>
                    <div className="space-y-1.5">
                      {it.accounts?.map((acc: any, aidx: number) => (
                        <div key={aidx} className="flex justify-between items-center text-xs p-2 bg-slate-900/60 rounded border border-slate-800">
                          <div>
                            <span className="text-slate-200 font-medium">{acc.name}</span>
                            <span className="text-[10px] text-slate-400 ml-2">({acc.type} / {acc.subtype})</span>
                            {acc.bills_found > 0 && (
                              <span className="text-[10px] text-indigo-400 ml-2 font-medium">· {acc.bills_found} fatura(s)</span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-slate-200 font-medium">R$ {Number(acc.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            <span className="text-[10px] text-slate-400 block">{acc.transactions_found} transação(ões)</span>
                          </div>
                        </div>
                      ))}
                      {(!it.accounts || it.accounts.length === 0) && (
                        <p className="text-[11px] text-slate-500 italic">Nenhuma conta retornada para esta instituição.</p>
                      )}
                    </div>
                  </div>

                  {/* Investimentos do banco */}
                  <div>
                    <span className="text-[11px] font-medium text-slate-300 block mb-1">
                      Investimentos Retornados ({it.investments?.length || 0}):
                    </span>
                    {it.investments?.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                        {it.investments.map((inv: any, iidx: number) => (
                          <div key={iidx} className="p-2 bg-slate-900/60 rounded border border-slate-800 text-xs">
                            <div className="font-semibold text-slate-200">{inv.name || inv.code}</div>
                            <div className="text-[10px] text-slate-400 flex justify-between mt-0.5">
                              <span>{inv.type || inv.subtype}</span>
                              <span className="text-emerald-400 font-medium">R$ {Number(inv.balance || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-400/80 bg-amber-500/10 p-2 rounded border border-amber-500/20">
                        O banco não retornou investimentos nesta conexão. Se você possui investimentos nesta instituição, verifique se a opção "Investimentos" foi marcada na autorização do app bancário.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => {
                  setShowDiagnosticsModal(false);
                  handleSyncAllExisting();
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow transition"
              >
                Sincronizar Todas Agora
              </button>
            </div>
          </div>
        </div>
      )}
    </main>

  );
}
