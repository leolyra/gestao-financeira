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
  DollarSign,
  Sparkles,
  Bot,
  Target,
  CheckCircle,
  AlertCircle,
  Calendar,
  Download
} from 'lucide-react';
import { fetchWithAuth, setToken, getToken, removeToken } from '@/lib/api';

const ASSET_CLASSES = [
  'Ações',
  'Fundos Imobiliários',
  'Internacional',
  'Renda Fixa',
  'Criptos'
];

const PERIOD_OPTIONS = [
  { label: 'Mês atual', value: 'current_month' },
  { label: '30 dias', value: '30d' },
  { label: 'Mês anterior', value: 'previous_month' },
  { label: '60 dias', value: '60d' },
  { label: '90 dias', value: '90d' },
  { label: 'Esse ano', value: 'current_year' },
  { label: 'Últimos 12 meses', value: '12m' },
  { label: 'Todo o Histórico', value: 'all' },
];

function getPeriodLabel(val: string): string {
  const found = PERIOD_OPTIONS.find((p) => p.value === val);
  return found ? found.label : val;
}

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
  type?: string;
  color?: string;
  user_id?: number | null;
  total_income?: number;
  total_expense?: number;
  balance?: number;
  transactions_count?: number;
}

interface TxColWidths {
  date: number;
  description: number;
  account: number;
  category: number;
  costType: number;
  nature: number;
  accounted: number;
  amount: number;
}

const DEFAULT_TX_COL_WIDTHS: TxColWidths = {
  date: 95,
  description: 240,
  account: 115,
  category: 135,
  costType: 95,
  nature: 105,
  accounted: 90,
  amount: 110,
};

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
  cost_type?: 'fixa' | 'variavel';
  is_accounted?: boolean;
  spending_nature?: 'recorrente' | 'futilidade';
}

interface DividendItem {
  id: number;
  trade_date: string;
  ticker: string;
  asset_name: string;
  asset_type: string;
  operation_type: string;
  total_amount: number;
  quantity?: number;
  unit_price?: number;
  source: string;
  notes?: string;
}

interface DividendAssetBreakdown {
  ticker: string;
  asset_name: string;
  asset_type: string;
  total_amount: number;
  percentage: number;
  events_count: number;
}

interface DividendPeriodResponse {
  period: string;
  period_label: string;
  start_date?: string;
  end_date?: string;
  total_amount: number;
  events_count: number;
  by_asset: DividendAssetBreakdown[];
  by_asset_class: Record<string, number>;
  items: DividendItem[];
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
  cost_type_summary?: {
    fixed_expense: number;
    variable_expense: number;
    fixed_income: number;
    variable_income: number;
    fixed_expense_pct: number;
    variable_expense_pct: number;
    fixed_income_pct: number;
    variable_income_pct: number;
  };
  spending_nature_summary?: {
    recorrente: number;
    futilidade: number;
    total: number;
    recorrente_pct: number;
    futilidade_pct: number;
    recorrente_count: number;
    futilidade_count: number;
    futilidade_by_category: { category: string; amount: number }[];
  };
}

export default function Home() {
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'historical' | 'transactions' | 'investments' | 'monitoring' | 'accounts' | 'categories'>('overview');

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
  const [dividendPeriod, setDividendPeriod] = useState<string>('current_month');
  const [dividendData, setDividendData] = useState<DividendPeriodResponse | null>(null);
  const [isLoadingDividends, setIsLoadingDividends] = useState<boolean>(false);
  const [custodiaClassFilter, setCustodiaClassFilter] = useState<string>('all');
  const [invAssetClass, setInvAssetClass] = useState<string>('Ações');
  const [showChangelogModal, setShowChangelogModal] = useState<boolean>(false);
  const [newTxSpendingNature, setNewTxSpendingNature] = useState<'recorrente' | 'futilidade'>('recorrente');
  const [filterSpendingNature, setFilterSpendingNature] = useState<'all' | 'recorrente' | 'futilidade'>('all');
  const [txColWidths, setTxColWidths] = useState<TxColWidths>(DEFAULT_TX_COL_WIDTHS);


  // Modais de Investimento
  const [showSinacorModal, setShowSinacorModal] = useState(false);
  const [showMigrateModal, setShowMigrateModal] = useState(false);
  const [showManualInvModal, setShowManualInvModal] = useState(false);
  const [invUploadMsg, setInvUploadMsg] = useState("");
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [isUploadingSpreadsheet, setIsUploadingSpreadsheet] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

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
  const [newCatType, setNewCatType] = useState('both');
  const [newCatColor, setNewCatColor] = useState('#3b82f6');

  const [newTxDesc, setNewTxDesc] = useState('');
  const [newTxAmount, setNewTxAmount] = useState('');
  const [newTxType, setNewTxType] = useState<'expense' | 'income'>('expense');
  const [newTxAccountId, setNewTxAccountId] = useState<number | ''>('');
  const [newTxCategoryId, setNewTxCategoryId] = useState<number | ''>('');
  const [newTxDate, setNewTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [newTxCostType, setNewTxCostType] = useState<'variavel' | 'fixa'>('variavel');
  const [newTxIsAccounted, setNewTxIsAccounted] = useState<boolean>(true);
  const [filterAccount, setFilterAccount] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterCostType, setFilterCostType] = useState<'all' | 'fixa' | 'variavel'>('all');
  const [filterAccounted, setFilterAccounted] = useState<'all' | 'yes' | 'no'>('all');
  const [filterPeriod, setFilterPeriod] = useState<string>('all');
  const [isExportingXlsx, setIsExportingXlsx] = useState<boolean>(false);

  // Dashboard Days & Historical Evolution State
  const [dashboardPeriod, setDashboardPeriod] = useState<string>('90d');
  const [categoryPeriod, setCategoryPeriod] = useState<string>('all');
  const [isLoadingCategories, setIsLoadingCategories] = useState<boolean>(false);
  const [historicalMonths, setHistoricalMonths] = useState<number>(12);
  const [historicalData, setHistoricalData] = useState<any>(null);
  const [isLoadingHistorical, setIsLoadingHistorical] = useState<boolean>(false);

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
      const [meRes, accRes, catRes, txRes, sumRes, portRes, invTxRes, invSumRes, divRes] = await Promise.all([
        fetchWithAuth('/auth/me'),
        fetchWithAuth('/accounts/'),
        fetchWithAuth(`/categories/?period=${categoryPeriod}`),
        fetchWithAuth('/transactions/'),
        fetchWithAuth(`/transactions/summary?period=${dashboardPeriod}`),
        fetchWithAuth('/investments/portfolio'),
        fetchWithAuth('/investments/transactions'),
        fetchWithAuth('/investments/summary'),
        fetchWithAuth(`/investments/dividends?period=${dividendPeriod}`)
      ]);

      if (portRes.ok) setPortfolio(await portRes.json());
      if (invTxRes.ok) setInvTransactions(await invTxRes.json());
      if (invSumRes.ok) setInvSummary(await invSumRes.json());
      if (divRes.ok) setDividendData(await divRes.json());

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
  async function fetchDividends(period: string) {
    setDividendPeriod(period);
    setIsLoadingDividends(true);
    try {
      const res = await fetchWithAuth(`/investments/dividends?period=${period}`);
      if (res.ok) {
        setDividendData(await res.json());
      }
    } catch (err) {
      console.error("Erro ao buscar dividendos:", err);
    } finally {
      setIsLoadingDividends(false);
    }
  }

  async function handleUpdateAssetClass(assetId: number, newClass: string) {
    try {
      const res = await fetchWithAuth(`/investments/assets/${assetId}/classification`, {
        method: 'PATCH',
        body: JSON.stringify({ asset_type: newClass })
      });
      if (res.ok) {
        setPortfolio(prev => prev.map(pos => pos.asset_id === assetId ? { ...pos, asset_type: newClass } : pos));
        fetchDividends(dividendPeriod);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Erro ao atualizar classificação: ${err.detail || res.statusText}`);
      }
    } catch (err: any) {
      alert(`Erro de conexão ao atualizar classificação: ${err.message}`);
    }
  }

  async function handleCreateManualInvestment(e: React.FormEvent) {
    e.preventDefault();
    if (!invTicker) return;

    const q = parseFloat(invQty) || 0;
    const p = parseFloat(invUnitPrice) || 0;
    const c = parseFloat(invCosts) || 0;

    let total = 0;
    let finalUnitPrice = p;

    const isDividend = ['dividend', 'jcp', 'rendimento'].includes(invOpType);
    if (isDividend) {
      // Para proventos, o valor digitado é o total recebido em R$
      total = p > 0 ? p : q;
      finalUnitPrice = q > 0 ? total / q : total;
    } else if (invOpType === 'buy') {
      total = (q * p) + c;
    } else {
      total = (q * p) - c;
    }

    try {
      const res = await fetchWithAuth("/investments/transactions", {
        method: "POST",
        body: JSON.stringify({
          ticker: invTicker.toUpperCase().trim(),
          operation_type: invOpType,
          asset_type: invAssetClass,
          quantity: q,
          unit_price: finalUnitPrice,
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

  async function handleUploadSpreadsheet(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingSpreadsheet(true);
    setInvUploadMsg("Lendo e processando planilha de investimentos...");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const token = getToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "https://api-financeira.leo.lyra.nom.br"}/api/v1/investments/upload-spreadsheet`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        setInvUploadMsg(`Erro: ${data.detail || "Falha ao processar planilha"}`);
        return;
      }
      setInvUploadMsg(`Sucesso! ${data.imported_rows} registros de investimentos importados da planilha.`);
      loadAllData();
    } catch (err: any) {
      setInvUploadMsg("Erro no envio: " + err.message);
    } finally {
      setIsUploadingSpreadsheet(false);
    }
  }

  async function handleRecalculateInvestments() {
    setIsRecalculating(true);
    setInvUploadMsg("Recalculando posições de custódia e proventos do zero...");
    try {
      const res = await fetchWithAuth("/investments/recalculate", {
        method: "POST"
      });
      if (res.ok) {
        setInvUploadMsg("Recálculo e saneamento da carteira concluídos com sucesso!");
        loadAllData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Erro ao recalcular: ${err.detail || res.statusText}`);
      }
    } catch (err: any) {
      alert(`Falha de conexão: ${err.message}`);
    } finally {
      setIsRecalculating(false);
    }
  }

  async function handleResetInvestmentData() {
    if (!confirm("ATENÇÃO: Deseja realmente zerar todos os lançamentos da carteira de investimentos para reiniciar do zero?\n\nEssa ação apagará os registros de investimentos atuais para que você possa importar sua planilha ou notas limpas.")) {
      return;
    }
    try {
      const res = await fetchWithAuth("/investments/reset-data", {
        method: "POST"
      });
      if (res.ok) {
        alert("Carteira de investimentos zerada com sucesso! Você pode agora importar seus arquivos do zero.");
        loadAllData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Erro ao zerar: ${err.detail || res.statusText}`);
      }
    } catch (err: any) {
      alert(`Falha de conexão: ${err.message}`);
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
          is_manual: true,
          cost_type: newTxCostType,
          is_accounted: newTxIsAccounted,
          spending_nature: newTxSpendingNature
        })
      });

      if (res.ok) {
        const created = await res.json();
        setTransactions([created, ...transactions]);
        setNewTxDesc('');
        setNewTxAmount('');
        setNewTxSpendingNature('recorrente');
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
        const sumRes = await fetchWithAuth('/transactions/summary?days=90');
        if (sumRes.ok) setSummary(await sumRes.json());
      }
    } catch (err) {
      console.error(err);
    }
  }

  const handleStartColResize = (e: React.MouseEvent, colKey: keyof TxColWidths) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = txColWidths[colKey];

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(50, startWidth + delta);
      setTxColWidths(prev => ({ ...prev, [colKey]: newWidth }));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  async function handleUpdateSpendingNature(txId: number, spendingNature: string) {
    try {
      const res = await fetchWithAuth(`/transactions/${txId}/spending-nature`, {
        method: 'PATCH',
        body: JSON.stringify({ spending_nature: spendingNature })
      });
      if (res.ok) {
        const updated = await res.json();
        setTransactions(prev => prev.map(t => t.id === txId ? updated : t));
        const sumRes = await fetchWithAuth(`/transactions/summary?period=${dashboardPeriod}`);
        if (sumRes.ok) setSummary(await sumRes.json());
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Aviso: O backend não conseguiu salvar a natureza do gasto: ${err.detail || res.statusText}`);
      }
    } catch (err: any) {
      console.error(err);
      alert('Falha de conexão com a API: ' + err.message);
    }
  }

  async function handleUpdateCostType(txId: number, costType: string) {
    try {
      const res = await fetchWithAuth(`/transactions/${txId}/cost-type`, {
        method: 'PATCH',
        body: JSON.stringify({ cost_type: costType })
      });
      if (res.ok) {
        const updated = await res.json();
        setTransactions(prev => prev.map(t => t.id === txId ? updated : t));
        const sumRes = await fetchWithAuth(`/transactions/summary?period=${dashboardPeriod}`);
        if (sumRes.ok) setSummary(await sumRes.json());
        const catRes = await fetchWithAuth(`/categories/?period=${categoryPeriod}`);
        if (catRes.ok) setCategories(await catRes.json());
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Aviso: O backend não conseguiu salvar o tipo de custo. Detalhes: ${err.detail || res.statusText}`);
      }
    } catch (err: any) {
      console.error(err);
      alert('Falha de conexão com a API: ' + err.message);
    }
  }

  function matchesPeriod(txDateStr: string, period: string): boolean {
    if (period === 'all') return true;
    const txDate = new Date(txDateStr);
    const now = new Date();

    if (period === 'current_month') {
      return txDate.getFullYear() === now.getFullYear() && txDate.getMonth() === now.getMonth();
    } else if (period === '30d') {
      const diff = now.getTime() - txDate.getTime();
      return diff >= 0 && diff <= (30 * 24 * 60 * 60 * 1000);
    } else if (period === 'previous_month') {
      const prevMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const prevYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      return txDate.getFullYear() === prevYear && txDate.getMonth() === prevMonth;
    } else if (period === '60d') {
      const diff = now.getTime() - txDate.getTime();
      return diff >= 0 && diff <= (60 * 24 * 60 * 60 * 1000);
    } else if (period === '90d') {
      const diff = now.getTime() - txDate.getTime();
      return diff >= 0 && diff <= (90 * 24 * 60 * 60 * 1000);
    } else if (period === 'current_year') {
      return txDate.getFullYear() === now.getFullYear();
    } else if (period === '12m') {
      const diff = now.getTime() - txDate.getTime();
      return diff >= 0 && diff <= (365 * 24 * 60 * 60 * 1000);
    }
    return true;
  }

  async function handleExportXlsx() {
    setIsExportingXlsx(true);
    try {
      const token = getToken();
      const currentFiltered = transactions.filter(t => {
        if (!matchesPeriod(t.date, filterPeriod)) return false;
        if (filterAccount !== 'all' && String(t.account_id) !== filterAccount) return false;
        if (filterCategory !== 'all') {
          if (filterCategory === 'none' && t.category_id) return false;
          if (filterCategory !== 'none' && String(t.category_id) !== filterCategory) return false;
        }
        if (filterCostType !== 'all' && (t.cost_type || 'variavel') !== filterCostType) return false;
        if (filterSpendingNature !== 'all' && (t.spending_nature || 'recorrente') !== filterSpendingNature) return false;
        if (filterAccounted !== 'all') {
          const isAcc = t.is_accounted ?? true;
          if (filterAccounted === 'yes' && !isAcc) return false;
          if (filterAccounted === 'no' && isAcc) return false;
        }
        return true;
      });

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://api-financeira.leo.lyra.nom.br'}/api/v1/transactions/export-xlsx`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          transaction_ids: currentFiltered.map(t => t.id),
          period: filterPeriod
        })
      });

      if (!res.ok) {
        throw new Error('Falha ao gerar arquivo Excel no servidor.');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `extrato_${filterPeriod}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Erro na exportação para Excel: ' + err.message);
    } finally {
      setIsExportingXlsx(false);
    }
  }

  async function handleDashboardPeriodChange(period: string) {
    setDashboardPeriod(period);
    try {
      const sumRes = await fetchWithAuth(`/transactions/summary?period=${period}`);
      if (sumRes.ok) setSummary(await sumRes.json());
    } catch (e) {
      console.error('Erro ao alterar período do dashboard:', e);
    }
  }

  async function handleCategoryPeriodChange(period: string) {
    setCategoryPeriod(period);
    setIsLoadingCategories(true);
    try {
      const catRes = await fetchWithAuth(`/categories/?period=${period}`);
      if (catRes.ok) setCategories(await catRes.json());
    } catch (e) {
      console.error('Erro ao filtrar categorias por período:', e);
    } finally {
      setIsLoadingCategories(false);
    }
  }

  async function loadHistoricalData(months = 12) {
    setIsLoadingHistorical(true);
    try {
      const res = await fetchWithAuth(`/transactions/historical-evolution?months=${months}`);
      if (res.ok) {
        setHistoricalData(await res.json());
      }
    } catch (e) {
      console.error('Erro ao carregar evolução histórica:', e);
    } finally {
      setIsLoadingHistorical(false);
    }
  }

  async function handleToggleAccounted(txId: number, currentVal: boolean) {
    const newVal = !currentVal;
    try {
      const res = await fetchWithAuth(`/transactions/${txId}/accounted`, {
        method: 'PATCH',
        body: JSON.stringify({ is_accounted: newVal })
      });
      if (res.ok) {
        const updated = await res.json();
        setTransactions(prev => prev.map(t => t.id === txId ? updated : t));
        const sumRes = await fetchWithAuth(`/transactions/summary?period=${dashboardPeriod}`);
        if (sumRes.ok) setSummary(await sumRes.json());
        const catRes = await fetchWithAuth(`/categories/?period=${categoryPeriod}`);
        if (catRes.ok) setCategories(await catRes.json());
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Aviso: O backend não conseguiu atualizar a contabilização. Detalhes: ${err.detail || res.statusText}. Verifique se o container api foi atualizado.`);
      }
    } catch (err: any) {
      console.error(err);
      alert('Falha de conexão com a API: ' + err.message);
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
      setPluggyStatusMsg(`Sincronização concluída! ${data.items_count} instituição(ões) encontrada(s), ${data.accounts_synced} novas contas e ${data.transactions_synced} transações importadas.`);
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
          setPluggyStatusMsg(`Sincronização concluída! ${syncData.transactions_synced} lançamentos importados.`);
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
        {/* MODAL DE CHANGELOG / HISTÓRICO DE VERSÕES */}
      {showChangelogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white">Histórico de Versões & Novidades</h2>
                    <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      v2.2
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Acompanhe a evolução, novos recursos e melhorias da plataforma financeira.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowChangelogModal(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Timeline de Versões */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-300">
              {/* VERSÃO 2.1 (ATUAL) */}
              <div className="relative pl-6 border-l-2 border-indigo-500 space-y-2">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-indigo-500 ring-4 ring-slate-900 flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-white text-sm">Versão 2.2</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold">
                    Versão Atual
                  </span>
                  <span className="text-slate-500 text-[11px]">Setembro / 2026</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Refinamento e correções prioritárias de visualização, ordenação e cálculo de proventos:
                </p>
                <ul className="space-y-1.5 list-disc list-inside text-slate-300 ml-1">
                  <li>
                    <strong className="text-white">Correção de Proventos por Período:</strong> Revisão profunda do cálculo de dividendos com vinculação estrita à carteira de investimentos (expurgando depósitos bancários, salários e contas remuneradas) e limites temporais fechados para o mês atual.
                  </li>
                  <li>
                    <strong className="text-white">Histórico em Ordem Decrescente:</strong> As consultas de dados históricos (Evolução Mensal, Matriz Financeira e Histórico de Proventos) agora exibem o mês atual no topo/início, seguido pelos meses mais antigos.
                  </li>
                  <li>
                    <strong className="text-white">Colunas Redimensionáveis & Responsivas:</strong> Tabela de transações com controle interativo de largura por arrasto de mouse nas bordas das colunas e ajuste automático para que a coluna Valor fique sempre 100% visível na tela.
                  </li>
                </ul>
              </div>

              {/* VERSÃO 2.0 */}
              <div className="relative pl-6 border-l-2 border-slate-700 space-y-2">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-700 ring-4 ring-slate-900"></div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-200 text-sm">Versão 2.0</span>
                  <span className="text-slate-500 text-[11px]">Setembro / 2026</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Versão com foco em inteligência orçamentária, análise comportamental de gastos e controle avançado de investimentos:
                </p>
                <ul className="space-y-1.5 list-disc list-inside text-slate-300 ml-1">
                  <li>
                    <strong className="text-white">Classificação Recorrente vs. Futilidade:</strong> Nova coluna interativa no extrato de lançamentos permitindo classificar gastos entre habituais/essenciais e supérfluos, com padrão automático como <em>Recorrente</em>.
                  </li>
                  <li>
                    <strong className="text-white">Dashboard de Futilidades:</strong> Painel de consolidação por período comparando o montante e percentual gasto em Recorrentes vs. Futilidades, com barra de proporção e ranking das categorias que mais consumiram gastos supérfluos.
                  </li>
                  <li>
                    <strong className="text-white">Filtro de Lançamentos por Natureza:</strong> Seleção rápida no extrato para auditar apenas despesas recorrentes ou apenas futilidades, integrado à exportação em Excel (.xlsx).
                  </li>
                  <li>
                    <strong className="text-white">Classificação Padronizada de Ativos:</strong> Organização da carteira em 5 classes oficiais (<em>Ações</em>, <em>Fundos Imobiliários</em>, <em>Internacional</em>, <em>Renda Fixa</em> e <em>Criptos</em>) com seletor interativo na custódia e barra de alocação patrimonial.
                  </li>
                  <li>
                    <strong className="text-white">Visualização de Dividendos por Período:</strong> Seção dedicada com filtro temporal unificado (Mês atual, 30d, mês anterior, 60d, 90d, esse ano, 12m), consolidando por ativo e desconsiderando ativos de Renda Fixa.
                  </li>
                  <li>
                    <strong className="text-white">Identificação da Aplicação (v2.0):</strong> Selo de versão ao lado do título com modal interativo de histórico de versões.
                  </li>
                </ul>
              </div>

              {/* VERSÃO 1.5 */}
              <div className="relative pl-6 border-l-2 border-slate-700 space-y-2">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-700 ring-4 ring-slate-900"></div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-200 text-sm">Versão 1.5</span>
                  <span className="text-slate-500 text-[11px]">Setembro / 2026</span>
                </div>
                <ul className="space-y-1.5 list-disc list-inside text-slate-400 ml-1">
                  <li>
                    <strong className="text-slate-300">Filtro Padronizado por Período:</strong> Opções unificadas (<em>Mês atual, 30 dias, mês anterior, 60 dias, 90 dias, esse ano e últimos 12 meses</em>) no Dashboard, Extrato e Categorias.
                  </li>
                  <li>
                    <strong className="text-slate-300">Não Contabilizar Lançamentos:</strong> Opção de desmarcar transações (como transferências internas e estornos) para não inflar receitas e despesas nos gráficos.
                  </li>
                  <li>
                    <strong className="text-slate-300">Exportação Nativa para Excel (.xlsx):</strong> Download de extrato contábil formatado com fórmulas de totais e filtros aplicados.
                  </li>
                </ul>
              </div>

              {/* VERSÃO 1.4 */}
              <div className="relative pl-6 border-l-2 border-slate-800 space-y-2">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-800 ring-4 ring-slate-900"></div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-200 text-sm">Versão 1.4</span>
                  <span className="text-slate-500 text-[11px]">Setembro / 2026</span>
                </div>
                <ul className="space-y-1.5 list-disc list-inside text-slate-400 ml-1">
                  <li>
                    <strong className="text-slate-300">Estrutura de Custos Fixos vs. Variáveis:</strong> Separação de custos contratuais e recorrentes para avaliação de flexibilidade orçamentária.
                  </li>
                  <li>
                    <strong className="text-slate-300">Evolução Histórica Mensal:</strong> Mapeamento mês a mês de receitas, despesas e saldo líquido.
                  </li>
                  <li>
                    <strong className="text-slate-300">Painel de Diagnóstico Open Finance:</strong> Inspeção técnica detalhada de contas e investimentos retornados pelas conexões bancárias.
                  </li>
                </ul>
              </div>

              {/* VERSÃO 1.0 */}
              <div className="relative pl-6 border-l-2 border-slate-800 space-y-2">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-800 ring-4 ring-slate-900"></div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-200 text-sm">Versão 1.0</span>
                  <span className="text-slate-500 text-[11px]">Setembro / 2026</span>
                </div>
                <ul className="space-y-1.5 list-disc list-inside text-slate-400 ml-1">
                  <li>Lançamento inicial da plataforma com sincronização bancária Open Finance via Pluggy.</li>
                  <li>Autocategorização de despesas com inteligência artificial local (Ollama).</li>
                  <li>Importação de notas de corretagem da B3 no formato Sinacor (PDF) e gestão consolidada de carteira.</li>
                </ul>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
              <button
                type="button"
                onClick={() => setShowChangelogModal(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition shadow"
              >
                Entendi / Fechar
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
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
              Painel Financeiro
            </h1>
            <button
              type="button"
              onClick={() => setShowChangelogModal(true)}
              className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 hover:text-indigo-300 border border-indigo-500/30 transition cursor-pointer shadow-sm flex items-center gap-1"
              title="Clique para ver o resumo das versões e novidades (Changelog)"
            >
              <span>v2.2</span>
              <Sparkles className="w-3 h-3 text-indigo-400" />
            </button>
          </div>
          <p className="text-sm text-slate-400 mt-0.5">
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
            <RefreshCw className={`w-3.5 h-3.5 ${isConnectingPluggy ? "animate-spin" : ""}`} /> Sincronizar Todas as Conexões
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
          <LayoutDashboard className="w-4 h-4" /> Visão Geral
        </button>
        <button
          onClick={() => {
            setActiveTab('historical');
            loadHistoricalData(historicalMonths);
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition whitespace-nowrap ${
            activeTab === 'historical'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <Calendar className="w-4 h-4 text-emerald-400" /> Evolução Histórica (Mês a Mês)
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
          {/* Seletor de Período do Dashboard & Atalho para Histórico Global */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-300 mr-1">Período dos Indicadores:</span>
              <div className="flex flex-wrap gap-1.5">
                {PERIOD_OPTIONS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => handleDashboardPeriodChange(p.value)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      dashboardPeriod === p.value
                        ? 'bg-indigo-600 text-white shadow'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveTab('historical');
                loadHistoricalData(historicalMonths);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white border border-indigo-500/30 rounded-lg text-xs font-semibold transition"
            >
              <span>Ver Evolução Mês a Mês</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400" />
            </button>
          </div>

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
                <span className="text-xs font-medium uppercase tracking-wider">Receitas ({getPeriodLabel(dashboardPeriod)})</span>
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
                <span className="text-xs font-medium uppercase tracking-wider">Despesas ({getPeriodLabel(dashboardPeriod)})</span>
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

          {/* Gráficos e Distribuição - Linha 1: Estrutura de Custos & Análise de Futilidades */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. Despesas Fixas vs. Variáveis */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-purple-400" /> Fixas vs. Variáveis ({getPeriodLabel(dashboardPeriod)})
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 font-medium">
                    Estrutura de Custos
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  Distribuição para análise de rigidez e flexibilidade do orçamento.
                </p>

                {/* Barra Proporcional Fixa x Variável */}
                <div className="space-y-2 mb-5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-purple-400 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                      Fixas: {summary?.cost_type_summary?.fixed_expense_pct ?? 0}%
                    </span>
                    <span className="text-amber-400 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                      Variáveis: {summary?.cost_type_summary?.variable_expense_pct ?? 0}%
                    </span>
                  </div>

                  {/* Barra Segmentada Visual */}
                  <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                    <div
                      className="bg-purple-500 hover:bg-purple-400 transition-all duration-500"
                      style={{ width: `${summary?.cost_type_summary?.fixed_expense_pct ?? 0}%` }}
                      title={`Despesas Fixas: R$ ${Number(summary?.cost_type_summary?.fixed_expense || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    />
                    <div
                      className="bg-amber-500 hover:bg-amber-400 transition-all duration-500"
                      style={{ width: `${summary?.cost_type_summary?.variable_expense_pct ?? 0}%` }}
                      title={`Despesas Variáveis: R$ ${Number(summary?.cost_type_summary?.variable_expense || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400 pt-1">
                    <span>R$ {Number(summary?.cost_type_summary?.fixed_expense || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    <span>R$ {Number(summary?.cost_type_summary?.variable_expense || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Cards Detalhados */}
                <div className="space-y-2.5">
                  <div className="p-3 bg-purple-950/20 border border-purple-800/30 rounded-lg flex justify-between items-center">
                    <div>
                      <span className="text-xs font-medium text-purple-200 block">Custos Fixos</span>
                      <span className="text-[10px] text-slate-400">Moradia, internet, assinaturas, contas</span>
                    </div>
                    <span className="text-sm font-bold text-purple-300">
                      R$ {Number(summary?.cost_type_summary?.fixed_expense || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="p-3 bg-amber-950/20 border border-amber-800/30 rounded-lg flex justify-between items-center">
                    <div>
                      <span className="text-xs font-medium text-amber-200 block">Custos Variáveis</span>
                      <span className="text-[10px] text-slate-400">Mercado, lazer, compras, imprevistos</span>
                    </div>
                    <span className="text-sm font-bold text-amber-300">
                      R$ {Number(summary?.cost_type_summary?.variable_expense || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Indicador de Resiliência */}
              <div className="mt-4 p-3 bg-slate-800/40 rounded-lg border border-slate-700/50 text-xs">
                {(summary?.cost_type_summary?.fixed_expense_pct ?? 0) <= 50 ? (
                  <span className="text-emerald-400 font-medium flex items-start gap-1.5">
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span><strong>Boa Flexibilidade:</strong> Seus custos fixos estão abaixo de 50% das despesas totais.</span>
                  </span>
                ) : (
                  <span className="text-amber-400 font-medium flex items-start gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span><strong>Atenção aos Custos Fixos:</strong> Mais de 50% dos gastos são fixos. Reduzir contratos amplia sua margem de investimentos.</span>
                  </span>
                )}
              </div>
            </div>

            {/* 2. Despesas Recorrentes vs. Futilidade */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl flex flex-col justify-between shadow-sm">
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-rose-400" /> Recorrente vs. Futilidade ({getPeriodLabel(dashboardPeriod)})
                  </h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-300 border border-rose-500/20 font-medium">
                    Análise de Supérfluos
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  Consolidação entre despesas habituais/essenciais e gastos dispensáveis ou por impulso no período selecionado.
                </p>

                {/* Barra Proporcional Recorrente x Futilidade */}
                <div className="space-y-2 mb-5">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-blue-400 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
                      Recorrente: {summary?.spending_nature_summary?.recorrente_pct ?? 0}%
                    </span>
                    <span className="text-rose-400 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                      Futilidade: {summary?.spending_nature_summary?.futilidade_pct ?? 0}%
                    </span>
                  </div>

                  {/* Barra Segmentada Visual */}
                  <div className="w-full h-4 bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                    <div
                      className="bg-blue-500 hover:bg-blue-400 transition-all duration-500"
                      style={{ width: `${summary?.spending_nature_summary?.recorrente_pct ?? 0}%` }}
                      title={`Despesas Recorrentes: R$ ${Number(summary?.spending_nature_summary?.recorrente || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    />
                    <div
                      className="bg-rose-500 hover:bg-rose-400 transition-all duration-500"
                      style={{ width: `${summary?.spending_nature_summary?.futilidade_pct ?? 0}%` }}
                      title={`Despesas Futilidade: R$ ${Number(summary?.spending_nature_summary?.futilidade || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-slate-400 pt-1 font-mono">
                    <span>R$ {Number(summary?.spending_nature_summary?.recorrente || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({summary?.spending_nature_summary?.recorrente_count || 0}x)</span>
                    <span className="text-rose-400 font-semibold">R$ {Number(summary?.spending_nature_summary?.futilidade || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({summary?.spending_nature_summary?.futilidade_count || 0}x)</span>
                  </div>
                </div>

                {/* Ranking de Categorias onde ocorreram Futilidades */}
                {summary?.spending_nature_summary?.futilidade_by_category && summary.spending_nature_summary.futilidade_by_category.length > 0 ? (
                  <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl space-y-2">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Onde foram os gastos supérfluos no período:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {summary.spending_nature_summary.futilidade_by_category.map((fc) => (
                        <span key={fc.category} className="px-2 py-0.5 bg-rose-500/10 text-rose-300 border border-rose-500/20 rounded text-[10px] font-medium font-mono">
                          {fc.category}: R$ {Number(fc.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl text-emerald-400 text-[11px] flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>Excelente! Nenhuma despesa classificada como futilidade no período selecionado.</span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/60 text-xs">
                {(summary?.spending_nature_summary?.futilidade_pct ?? 0) <= 15 ? (
                  <span className="text-emerald-400 font-medium flex items-start gap-1.5">
                    <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span><strong>Excelente Disciplina:</strong> Apenas {(summary?.spending_nature_summary?.futilidade_pct ?? 0)}% dos gastos foram futilidades.</span>
                  </span>
                ) : (
                  <span className="text-amber-400 font-medium flex items-start gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span><strong>Oportunidade de Poupança:</strong> {(summary?.spending_nature_summary?.futilidade_pct ?? 0)}% das despesas foram futilidades. Reduzi-las aumenta sua capacidade de aporte.</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Gráficos e Distribuição - Linha 2: Categorias & Histórico Mensal */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Distribuição por Categoria */}
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Tag className="w-4 h-4 text-indigo-400" /> Composição de Gastos por Categoria ({getPeriodLabel(dashboardPeriod)})
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

      {/* ABA 1.5: EVOLUÇÃO HISTÓRICA MÊS A MÊS */}
      {activeTab === 'historical' && (
        <section className="mt-6 space-y-6">
          {/* Header da Tela Histórica com Filtros */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 bg-slate-900 border border-slate-800 rounded-xl">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-400" /> Evolução Financeira Mês a Mês
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Acompanhamento temporal consolidado de receitas, despesas fixas, despesas variáveis e resultado líquido.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Janela de Análise:</span>
              <div className="flex gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
                {[
                  { label: '6 meses', val: 6 },
                  { label: '12 meses', val: 12 },
                  { label: '24 meses', val: 24 },
                  { label: 'Todo o Histórico', val: 120 }
                ].map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => {
                      setHistoricalMonths(opt.val);
                      loadHistoricalData(opt.val);
                    }}
                    className={`px-2.5 py-1 text-xs rounded-md font-medium transition ${
                      historicalMonths === opt.val
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Cards de Médias Mensais e Totais Históricos */}
          {historicalData?.summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400 block">Média de Receita Mensal</span>
                <span className="text-2xl font-bold text-emerald-400 mt-2 block font-mono">
                  R$ {Number(historicalData.summary.avg_monthly_income || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Total no período: R$ {Number(historicalData.summary.total_income || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400 block">Média de Despesa Mensal</span>
                <span className="text-2xl font-bold text-rose-400 mt-2 block font-mono">
                  R$ {Number(historicalData.summary.avg_monthly_expense || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Total no período: R$ {Number(historicalData.summary.total_expense || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400 block">Média de Gastos Fixos vs Variáveis</span>
                <div className="flex justify-between items-baseline mt-2">
                  <div>
                    <span className="text-xs text-purple-400 block font-semibold">Fixos</span>
                    <span className="text-base font-bold text-purple-300 font-mono">
                      R$ {Number(historicalData.summary.avg_fixed_expense || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-amber-400 block font-semibold">Variáveis</span>
                    <span className="text-base font-bold text-amber-300 font-mono">
                      R$ {Number(historicalData.summary.avg_variable_expense || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden flex">
                  {historicalData.summary.avg_monthly_expense > 0 && (
                    <>
                      <div
                        className="bg-purple-500 h-full"
                        style={{ width: `${(historicalData.summary.avg_fixed_expense / historicalData.summary.avg_monthly_expense) * 100}%` }}
                      />
                      <div
                        className="bg-amber-500 h-full"
                        style={{ width: `${(historicalData.summary.avg_variable_expense / historicalData.summary.avg_monthly_expense) * 100}%` }}
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400 block">Superávit Acumulado & Taxa Média</span>
                <span className={`text-2xl font-bold mt-2 block font-mono ${historicalData.summary.total_net >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>
                  R$ {Number(historicalData.summary.total_net || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-slate-400 mt-1 block">
                  {historicalData.summary.total_months_count || 0} meses analisados
                </span>
              </div>
            </div>
          )}

          {/* Gráfico Comparativo Visual Mês a Mês */}
          <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-indigo-400" /> Gráfico Comparativo Mês a Mês (Receitas vs Fixas vs Variáveis)
              </span>
              <div className="flex items-center gap-4 text-xs font-normal">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-500"></span> Receita</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-purple-500"></span> Despesa Fixa</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-500"></span> Despesa Variável</span>
              </div>
            </h3>

            {isLoadingHistorical ? (
              <div className="py-12 flex justify-center items-center">
                <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
              </div>
            ) : (!historicalData?.months || historicalData.months.length === 0) ? (
              <p className="text-xs text-slate-500 py-12 text-center">Nenhuma movimentação contabilizada encontrada no período selecionado.</p>
            ) : (
              <div className="space-y-4">
                {historicalData.months.map((m: any) => {
                  const maxBar = Math.max(m.income, m.expense, 1);
                  return (
                    <div key={m.month} className="p-3.5 bg-slate-800/40 border border-slate-800/80 rounded-xl space-y-2">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 text-xs">
                        <span className="font-bold text-white text-sm font-mono">{m.month}</span>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className={`font-semibold ${m.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            Líquido: {m.net >= 0 ? '+' : ''} R$ {Number(m.net).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                          {m.income > 0 && (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${m.savings_rate >= 20 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-300'}`}>
                              Poupança: {m.savings_rate}%
                            </span>
                          )}
                          <span className="text-[11px] text-purple-300 bg-purple-950/40 px-2 py-0.5 rounded border border-purple-800/40">
                            Fixas: {m.fixed_expense_pct}%
                          </span>
                        </div>
                      </div>

                      {/* Barra de Receitas */}
                      <div className="flex items-center gap-3 text-xs">
                        <span className="w-20 text-slate-400 text-[11px]">Receitas</span>
                        <div className="flex-1 h-3 bg-slate-900 rounded-full overflow-hidden flex">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${(m.income / maxBar) * 100}%` }}
                          />
                        </div>
                        <span className="w-28 text-right font-mono text-emerald-400 font-semibold text-xs">
                          R$ {Number(m.income).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      {/* Barra de Despesas (Segmentada: Fixa + Variável) */}
                      <div className="flex items-center gap-3 text-xs">
                        <span className="w-20 text-slate-400 text-[11px]">Despesas</span>
                        <div className="flex-1 h-3 bg-slate-900 rounded-full overflow-hidden flex">
                          <div
                            className="bg-purple-500 h-full transition-all duration-500"
                            style={{ width: `${(m.fixed_expense / maxBar) * 100}%` }}
                            title={`Fixas: R$ ${Number(m.fixed_expense).toFixed(2)}`}
                          />
                          <div
                            className="bg-amber-500 h-full transition-all duration-500"
                            style={{ width: `${(m.variable_expense / maxBar) * 100}%` }}
                            title={`Variáveis: R$ ${Number(m.variable_expense).toFixed(2)}`}
                          />
                        </div>
                        <span className="w-28 text-right font-mono text-rose-400 font-semibold text-xs">
                          R$ {Number(m.expense).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tabela Detalhada de Evolução Mês a Mês */}
          {historicalData?.months?.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex justify-between items-center">
                <h3 className="text-sm font-semibold text-white">Matriz Financeira Consolidada Mês a Mês</h3>
                <span className="text-xs text-slate-400">{historicalData.months.length} meses registrados</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Mês</th>
                      <th className="py-3 px-4 text-right">Receitas</th>
                      <th className="py-3 px-4 text-right">Despesas Fixas</th>
                      <th className="py-3 px-4 text-right">Despesas Variáveis</th>
                      <th className="py-3 px-4 text-right">Total Despesas</th>
                      <th className="py-3 px-4 text-right">Resultado Líquido</th>
                      <th className="py-3 px-4 text-right">Poupança (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                    {historicalData.months.map((m: any) => (
                      <tr key={m.month} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-4 font-bold text-white">{m.month}</td>
                        <td className="py-3 px-4 text-right text-emerald-400">
                          R$ {Number(m.income).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right text-purple-300">
                          R$ {Number(m.fixed_expense).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <span className="text-[10px] text-slate-500 font-sans">({m.fixed_expense_pct}%)</span>
                        </td>
                        <td className="py-3 px-4 text-right text-amber-300">
                          R$ {Number(m.variable_expense).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <span className="text-[10px] text-slate-500 font-sans">({m.variable_expense_pct}%)</span>
                        </td>
                        <td className="py-3 px-4 text-right text-rose-400 font-bold">
                          R$ {Number(m.expense).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className={`py-3 px-4 text-right font-bold ${m.net >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>
                          {m.net >= 0 ? '+' : ''} R$ {Number(m.net).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="py-3 px-4 text-right font-sans">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${m.savings_rate >= 20 ? 'bg-emerald-500/10 text-emerald-400' : m.savings_rate > 0 ? 'bg-slate-800 text-slate-300' : 'bg-rose-500/10 text-rose-400'}`}>
                            {m.savings_rate}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Matriz Histórica de Categorias Mês a Mês */}
          {historicalData?.months?.length > 0 && historicalData?.categories_list?.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-slate-800">
                <h3 className="text-sm font-semibold text-white">Evolução de Gastos por Categoria Mês a Mês</h3>
                <p className="text-xs text-slate-400 mt-0.5">Acompanhe as oscilações de cada categoria de gastos ao longo dos meses.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4 font-semibold">Categoria</th>
                      {historicalData.months.map((m: any) => (
                        <th key={m.month} className="py-3 px-3 text-right font-mono">{m.month}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                    {historicalData.categories_list.map((catName: string) => (
                      <tr key={catName} className="hover:bg-slate-800/30 transition">
                        <td className="py-2.5 px-4 font-sans font-medium text-slate-200 whitespace-nowrap">{catName}</td>
                        {historicalData.months.map((m: any) => {
                          const val = m.categories?.[catName] || 0;
                          return (
                            <td key={m.month} className={`py-2.5 px-3 text-right whitespace-nowrap ${val > 0 ? 'text-slate-300' : 'text-slate-600'}`}>
                              {val > 0 ? `R$ ${Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 0 })}` : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
            <form onSubmit={handleCreateTransaction} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-9 gap-3">
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

              <div>
                <select
                  value={newTxCostType}
                  onChange={(e) => setNewTxCostType(e.target.value as 'variavel' | 'fixa')}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="variavel">Gasto Variável</option>
                  <option value="fixa">Gasto Fixo</option>
                </select>
              </div>

              <div>
                <select
                  value={newTxSpendingNature}
                  onChange={(e) => setNewTxSpendingNature(e.target.value as 'recorrente' | 'futilidade')}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                  title="Classificação de Natureza do Gasto (Padrão: Recorrente)"
                >
                  <option value="recorrente">Recorrente (Padrão)</option>
                  <option value="futilidade">Futilidade</option>
                </select>
              </div>

              <div className="flex items-center gap-2 px-1">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newTxIsAccounted}
                    onChange={(e) => setNewTxIsAccounted(e.target.checked)}
                    className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span>Contabilizar</span>
                </label>
              </div>

              <div className="sm:col-span-2 lg:col-span-9 flex justify-end">
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
            <div className="p-4 border-b border-slate-800 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div>
                <h3 className="text-sm font-semibold text-white">Extrato Consolidado de Transações</h3>
                <span className="text-xs text-slate-400">
                  {transactions.filter(t => {
                    if (!matchesPeriod(t.date, filterPeriod)) return false;
                    if (filterAccount !== 'all' && String(t.account_id) !== filterAccount) return false;
                    if (filterCategory !== 'all') {
                      if (filterCategory === 'none' && t.category_id) return false;
                      if (filterCategory !== 'none' && String(t.category_id) !== filterCategory) return false;
                    }
                    if (filterCostType !== 'all' && (t.cost_type || 'variavel') !== filterCostType) return false;
                    if (filterSpendingNature !== 'all' && (t.spending_nature || 'recorrente') !== filterSpendingNature) return false;
                    if (filterAccounted !== 'all') {
                      const isAcc = t.is_accounted ?? true;
                      if (filterAccounted === 'yes' && !isAcc) return false;
                      if (filterAccounted === 'no' && isAcc) return false;
                    }
                    return true;
                  }).length} de {transactions.length} registros exibidos
                </span>
              </div>

              {/* Barra de Filtros Múltiplos: Período, Conta, Categoria, Tipo e Contabilização */}
              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                {/* Filtro por Período Padronizado */}
                <select
                  value={filterPeriod}
                  onChange={(e) => setFilterPeriod(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-semibold text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  title="Filtrar por Período Padronizado"
                >
                  {PERIOD_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>

                {/* Filtro por Conta */}
                <select
                  value={filterAccount}
                  onChange={(e) => setFilterAccount(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  title="Filtrar por Conta Bancária ou Cartão"
                >
                  <option value="all">Todas as Contas</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={String(a.id)}>{a.name}</option>
                  ))}
                </select>

                {/* Filtro por Categoria */}
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  title="Filtrar por Categoria"
                >
                  <option value="all">Todas as Categorias</option>
                  <option value="none">Sem Categoria</option>
                  {categories.map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
                </select>

                {/* Filtro por Tipo de Custo */}
                <select
                  value={filterCostType}
                  onChange={(e) => setFilterCostType(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  title="Filtrar por Fixa / Variável"
                >
                  <option value="all">Fixas e Variáveis</option>
                  <option value="fixa">Apenas Fixas</option>
                  <option value="variavel">Apenas Variáveis</option>
                </select>

                {/* Filtro por Natureza: Recorrente / Futilidade */}
                <select
                  value={filterSpendingNature}
                  onChange={(e) => setFilterSpendingNature(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  title="Filtrar por Recorrente ou Futilidade"
                >
                  <option value="all">Todas as Naturezas</option>
                  <option value="recorrente">Apenas Recorrentes</option>
                  <option value="futilidade">Apenas Futilidades</option>
                </select>

                {/* Filtro por Contabilização */}
                <select
                  value={filterAccounted}
                  onChange={(e) => setFilterAccounted(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
                  title="Filtrar por inclusão no Dashboard"
                >
                  <option value="all">Todos os Lançamentos</option>
                  <option value="yes">Apenas Contabilizados</option>
                  <option value="no">Apenas Ignorados</option>
                </select>

                {(filterAccount !== 'all' || filterCategory !== 'all' || filterCostType !== 'all' || filterSpendingNature !== 'all' || filterAccounted !== 'all' || filterPeriod !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterPeriod('all');
                      setFilterAccount('all');
                      setFilterCategory('all');
                      setFilterCostType('all');
                      setFilterSpendingNature('all');
                      setFilterAccounted('all');
                    }}
                    className="px-2 py-1 text-[11px] text-rose-400 hover:text-rose-300 hover:underline transition"
                  >
                    Limpar Filtros
                  </button>
                )}

                {/* Botão Redefinir Largura das Colunas */}
                <button
                  type="button"
                  onClick={() => setTxColWidths(DEFAULT_TX_COL_WIDTHS)}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium transition"
                  title="Redefinir larguras padrão das colunas da tabela"
                >
                  Ajustar Colunas
                </button>

                {/* Botão Exportar Excel .XLSX */}
                <button
                  type="button"
                  onClick={handleExportXlsx}
                  disabled={isExportingXlsx}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold shadow transition disabled:opacity-50"
                  title="Exportar registros filtrados para planilha Excel (.xlsx)"
                >
                  <Download className={`w-3.5 h-3.5 ${isExportingXlsx ? 'animate-spin' : ''}`} />
                  <span>{isExportingXlsx ? 'Exportando...' : 'Exportar (.xlsx)'}</span>
                </button>
              </div>
            </div>

            {/* Tabela com Colunas Ajustáveis (Redimensionáveis por Arrasto) */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300 table-fixed" style={{ minWidth: '950px' }}>
                <thead className="bg-slate-950 text-slate-400 text-[11px] uppercase tracking-wider border-b border-slate-800 select-none">
                  <tr>
                    <th style={{ width: `${txColWidths.date}px` }} className="relative py-2.5 px-3 whitespace-nowrap">
                      <span>Data</span>
                      <div
                        onMouseDown={(e) => handleStartColResize(e, 'date')}
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/80 active:bg-indigo-500 z-10" title="Arraste para ajustar largura da coluna Data"></div>
                    </th>
                    <th style={{ width: `${txColWidths.description}px` }} className="relative py-2.5 px-3">
                      <span>Descrição</span>
                      <div
                        onMouseDown={(e) => handleStartColResize(e, 'description')}
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/80 active:bg-indigo-500 z-10" title="Arraste para ajustar largura da coluna Descrição"></div>
                    </th>
                    <th style={{ width: `${txColWidths.account}px` }} className="relative py-2.5 px-3 whitespace-nowrap">
                      <span>Conta</span>
                      <div
                        onMouseDown={(e) => handleStartColResize(e, 'account')}
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/80 active:bg-indigo-500 z-10" title="Arraste para ajustar largura da coluna Conta"></div>
                    </th>
                    <th style={{ width: `${txColWidths.category}px` }} className="relative py-2.5 px-3 whitespace-nowrap">
                      <span>Categoria</span>
                      <div
                        onMouseDown={(e) => handleStartColResize(e, 'category')}
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/80 active:bg-indigo-500 z-10" title="Arraste para ajustar largura da coluna Categoria"></div>
                    </th>
                    <th style={{ width: `${txColWidths.costType}px` }} className="relative py-2.5 px-3 whitespace-nowrap">
                      <span>Tipo</span>
                      <div
                        onMouseDown={(e) => handleStartColResize(e, 'costType')}
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/80 active:bg-indigo-500 z-10" title="Arraste para ajustar largura da coluna Tipo"></div>
                    </th>
                    <th style={{ width: `${txColWidths.nature}px` }} className="relative py-2.5 px-3 whitespace-nowrap">
                      <span>Natureza</span>
                      <div
                        onMouseDown={(e) => handleStartColResize(e, 'nature')}
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/80 active:bg-indigo-500 z-10" title="Arraste para ajustar largura da coluna Natureza"></div>
                    </th>
                    <th style={{ width: `${txColWidths.accounted}px` }} className="relative py-2.5 px-2 text-center whitespace-nowrap" title="Se ativado, entra nos totais do Dashboard">
                      <span>Contabilizar</span>
                      <div
                        onMouseDown={(e) => handleStartColResize(e, 'accounted')}
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/80 active:bg-indigo-500 z-10" title="Arraste para ajustar largura da coluna Contabilizar"></div>
                    </th>
                    <th style={{ width: `${txColWidths.amount}px` }} className="relative py-2.5 px-3 text-right whitespace-nowrap">
                      <span>Valor</span>
                      <div
                        onMouseDown={(e) => handleStartColResize(e, 'amount')}
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-indigo-500/80 active:bg-indigo-500 z-10" title="Arraste para ajustar largura da coluna Valor"></div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {transactions.filter(t => {
                    if (!matchesPeriod(t.date, filterPeriod)) return false;
                    if (filterAccount !== 'all' && String(t.account_id) !== filterAccount) return false;
                    if (filterCategory !== 'all') {
                      if (filterCategory === 'none' && t.category_id) return false;
                      if (filterCategory !== 'none' && String(t.category_id) !== filterCategory) return false;
                    }
                    if (filterCostType !== 'all' && (t.cost_type || 'variavel') !== filterCostType) return false;
                    if (filterSpendingNature !== 'all' && (t.spending_nature || 'recorrente') !== filterSpendingNature) return false;
                    if (filterAccounted !== 'all') {
                      const isAcc = t.is_accounted ?? true;
                      if (filterAccounted === 'yes' && !isAcc) return false;
                      if (filterAccounted === 'no' && isAcc) return false;
                    }
                    return true;
                  }).map((tx) => {
                    const isIncome = Number(tx.amount) > 0;
                    const isAcc = tx.is_accounted ?? true;
                    return (
                      <tr key={tx.id} className={`hover:bg-slate-800/30 transition ${!isAcc ? 'opacity-60 bg-slate-950/40' : ''}`}>
                        {/* Data */}
                        <td style={{ width: `${txColWidths.date}px` }} className="py-2.5 px-3 text-xs whitespace-nowrap text-slate-400 font-mono">
                          {new Date(tx.date).toLocaleDateString('pt-BR')}
                        </td>

                        {/* Descrição com truncate e tooltip */}
                        <td style={{ width: `${txColWidths.description}px` }} className="py-2.5 px-3 font-medium truncate" title={tx.description}>
                          <div className="flex items-center gap-1.5 truncate">
                            <span className={`truncate text-xs ${!isAcc ? 'line-through opacity-80 text-slate-400' : 'text-white'}`}>
                              {tx.description}
                            </span>
                            {!tx.is_manual && (
                              <span className="shrink-0 px-1 py-0.2 bg-emerald-500/10 text-emerald-400 text-[9px] rounded border border-emerald-500/20">
                                OF
                              </span>
                            )}
                            {!isAcc && (
                              <span className="shrink-0 px-1 py-0.2 bg-slate-800 text-slate-400 text-[9px] rounded border border-slate-700">
                                Ignorado
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Conta */}
                        <td style={{ width: `${txColWidths.account}px` }} className="py-2.5 px-3 text-xs text-slate-400 truncate" title={tx.account_name || 'Conta Padrão'}>
                          <span className="truncate block">{tx.account_name || 'Conta Padrão'}</span>
                        </td>

                        {/* Categoria */}
                        <td style={{ width: `${txColWidths.category}px` }} className="py-2.5 px-2 whitespace-nowrap">
                          <select
                            value={tx.category_id || ''}
                            onChange={(e) => handleUpdateCategory(tx.id, e.target.value ? Number(e.target.value) : null)}
                            className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer truncate"
                          >
                            <option value="">Sem Categoria</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </td>

                        {/* Tipo (Fixa / Variável) */}
                        <td style={{ width: `${txColWidths.costType}px` }} className="py-2.5 px-2 whitespace-nowrap">
                          <select
                            value={tx.cost_type || 'variavel'}
                            onChange={(e) => handleUpdateCostType(tx.id, e.target.value)}
                            className={`w-full px-2 py-1 rounded text-xs font-semibold cursor-pointer border focus:outline-none transition shadow-sm ${
                              tx.cost_type === 'fixa'
                                ? 'bg-purple-950/70 border-purple-600/50 text-purple-300 hover:bg-purple-900/60'
                                : 'bg-amber-950/70 border-amber-600/50 text-amber-300 hover:bg-amber-900/60'
                            }`}
                          >
                            <option value="variavel">Variável</option>
                            <option value="fixa">Fixa</option>
                          </select>
                        </td>

                        {/* Natureza (Recorrente / Futilidade) */}
                        <td style={{ width: `${txColWidths.nature}px` }} className="py-2.5 px-2 whitespace-nowrap">
                          <select
                            value={tx.spending_nature || 'recorrente'}
                            onChange={(e) => handleUpdateSpendingNature(tx.id, e.target.value)}
                            className={`w-full px-2 py-1 rounded text-xs font-semibold cursor-pointer border focus:outline-none transition shadow-sm ${
                              tx.spending_nature === 'futilidade'
                                ? 'bg-rose-950/70 border-rose-600/50 text-rose-300 hover:bg-rose-900/60'
                                : 'bg-blue-950/70 border-blue-600/50 text-blue-300 hover:bg-blue-900/60'
                            }`}
                            title="Classificar transação como Recorrente ou Futilidade"
                          >
                            <option value="recorrente">Recorrente</option>
                            <option value="futilidade">Futilidade</option>
                          </select>
                        </td>

                        {/* Contabilizar (Sim / Não) */}
                        <td style={{ width: `${txColWidths.accounted}px` }} className="py-2.5 px-2 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleToggleAccounted(tx.id, tx.is_accounted ?? true)}
                            title={(tx.is_accounted ?? true) ? "Contabilizado no Dashboard (clique para ignorar)" : "Ignorado no Dashboard (clique para contabilizar)"}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border transition shadow-sm ${
                              (tx.is_accounted ?? true)
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                            }`}
                          >
                            {(tx.is_accounted ?? true) ? (
                              <><CheckCircle className="w-3 h-3" /> <span>Sim</span></>
                            ) : (
                              <><span className="text-[10px] font-bold">✕</span> <span>Não</span></>
                            )}
                          </button>
                        </td>

                        {/* Valor (Sempre visível à direita) */}
                        <td style={{ width: `${txColWidths.amount}px` }} className={`py-2.5 px-3 text-right font-bold text-xs whitespace-nowrap font-mono ${isIncome ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isIncome ? '+' : ''} R$ {Number(tx.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-xs text-slate-500">
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
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
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

            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-xs font-medium uppercase tracking-wider">Proventos ({getPeriodLabel(dividendPeriod)})</span>
                <DollarSign className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-emerald-400 font-mono">
                  R$ {Number(dividendData ? dividendData.total_amount : (invSummary?.total_dividends_received || 0)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                  <span>Renda Variável no período</span>
                  <span className="text-slate-400 font-mono">
                    Histórico: R$ {Number(invSummary?.total_dividends_received || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
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

            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-xs font-medium uppercase tracking-wider">Ações & Importação</span>
                <UploadCloud className="w-4 h-4 text-blue-400" />
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="cursor-pointer text-center px-2 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition flex items-center justify-center gap-1" title="Importar notas de corretagem da B3 em PDF">
                    <span>{isUploadingPdf ? "Lendo..." : "Nota PDF B3"}</span>
                    <input type="file" accept=".pdf" onChange={handleUploadSinacor} className="hidden" />
                  </label>
                  <label className="cursor-pointer text-center px-2 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition flex items-center justify-center gap-1" title="Importar planilha de custódia ou operações (.xlsx, .csv)">
                    <span>{isUploadingSpreadsheet ? "Lendo..." : "Planilha Excel"}</span>
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleUploadSpreadsheet} className="hidden" />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={handleRecalculateInvestments}
                    disabled={isRecalculating}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white border border-slate-700 rounded-lg text-[11px] font-medium transition flex items-center justify-center gap-1 disabled:opacity-50"
                    title="Recalcular do zero todas as posições de custódia e proventos"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRecalculating ? "animate-spin" : ""}`} />
                    <span>Recalcular</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMigrateModal(!showMigrateModal)}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-[11px] font-medium transition"
                  >
                    Migrar Ticker
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleResetInvestmentData}
                  className="w-full px-2 py-1 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-200 border border-rose-800/40 rounded-lg text-[10px] font-medium transition"
                  title="Zerar todos os lançamentos da carteira para reiniciar do zero"
                >
                  Zerar Carteira (Reiniciar do Zero)
                </button>
              </div>
            </div>
          </div>

          {/* Feedback de Upload / Mensagens */}
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

          {/* SEÇÃO 2: PROVENTOS & DIVIDENDOS RECEBIDOS POR PERÍODO */}
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl space-y-5">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                  <span>Visualização de Dividendos Recebidos por Período</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Acompanhe seus rendimentos e dividendos de renda variável recebidos no período selecionado (proventos de ativos de Renda Fixa desconsiderados).
                </p>
              </div>

              {/* Filtro de Período Padronizado */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-800">
                {PERIOD_OPTIONS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => fetchDividends(p.value)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                      dividendPeriod === p.value
                        ? 'bg-emerald-600 text-white shadow font-semibold'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cards Resumo do Período Selecionado */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-950/80 border border-slate-800/80 rounded-xl">
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                  Total Recebido ({getPeriodLabel(dividendPeriod)})
                </span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-black text-emerald-400 font-mono">
                    R$ {Number(dividendData?.total_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {dividendData?.events_count || 0} lançamentos no período
                </p>
              </div>

              <div className="p-4 bg-slate-950/80 border border-slate-800/80 rounded-xl">
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Maior Pagador</span>
                <div className="mt-2">
                  {dividendData?.by_asset && dividendData.by_asset.length > 0 ? (
                    <div>
                      <span className="text-lg font-bold text-white font-mono">{dividendData.by_asset[0].ticker}</span>
                      <span className="text-xs text-slate-400 ml-2">({dividendData.by_asset[0].percentage}%)</span>
                      <div className="text-sm font-semibold text-emerald-400 font-mono mt-0.5">
                        R$ {Number(dividendData.by_asset[0].total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500 italic">Sem proventos no período</span>
                  )}
                </div>
              </div>

              <div className="p-4 bg-slate-950/80 border border-slate-800/80 rounded-xl">
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Fundos Imobiliários</span>
                <div className="mt-2">
                  <span className="text-xl font-bold text-emerald-300 font-mono">
                    R$ {Number(dividendData?.by_asset_class?.['Fundos Imobiliários'] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-1">Rendimentos mensais de FIIs</p>
                </div>
              </div>

              <div className="p-4 bg-slate-950/80 border border-slate-800/80 rounded-xl">
                <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Ações, Internacional & Criptos</span>
                <div className="mt-2">
                  <span className="text-xl font-bold text-blue-300 font-mono">
                    R$ {(
                      Number(dividendData?.by_asset_class?.['Ações'] || 0) +
                      Number(dividendData?.by_asset_class?.['Internacional'] || 0) +
                      Number(dividendData?.by_asset_class?.['Criptos'] || 0)
                    ).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                  <p className="text-[11px] text-slate-500 mt-1">Dividendos e JCP (Renda Variável)</p>
                </div>
              </div>
            </div>

            {/* Consolidação de Proventos por Ativo */}
            {dividendData?.by_asset && dividendData.by_asset.length > 0 ? (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Consolidação por Ativo no Período ({getPeriodLabel(dividendPeriod)})
                  </h4>
                  <span className="text-xs text-slate-400 font-mono">{dividendData.by_asset.length} ativos geraram renda</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {dividendData.by_asset.map((ast) => (
                    <div key={ast.ticker} className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white font-mono text-sm">{ast.ticker}</span>
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-medium border ${
                            ast.asset_type === 'Ações' ? 'bg-blue-500/10 text-blue-300 border-blue-500/20' :
                            ast.asset_type === 'Fundos Imobiliários' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' :
                            ast.asset_type === 'Internacional' ? 'bg-purple-500/10 text-purple-300 border-purple-500/20' :
                            ast.asset_type === 'Renda Fixa' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' :
                            'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
                          }`}>
                            {ast.asset_type}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 truncate max-w-[150px] mt-0.5">{ast.asset_name}</p>
                        <span className="text-[10px] text-slate-500">{ast.events_count} {ast.events_count === 1 ? 'pagamento' : 'pagamentos'}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-emerald-400 font-mono text-sm">
                          R$ {Number(ast.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-400 font-mono mt-0.5">
                          {ast.percentage}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-6 text-center bg-slate-950/40 border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
                Nenhum provento ou dividendo registrado no período selecionado ({getPeriodLabel(dividendPeriod)}).
              </div>
            )}

            {/* Extrato Detalhado de Proventos do Período */}
            {dividendData?.items && dividendData.items.length > 0 && (
              <div className="border border-slate-800 rounded-xl overflow-hidden mt-4">
                <div className="p-3 bg-slate-950 border-b border-slate-800 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Extrato de Proventos do Período ({dividendData.items.length} lançamentos)
                  </span>
                  <span className="text-xs text-emerald-400 font-mono font-semibold">
                    Total: R$ {Number(dividendData.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950/90 text-slate-400 uppercase tracking-wider border-b border-slate-800 sticky top-0">
                      <tr>
                        <th className="py-2.5 px-4">Data</th>
                        <th className="py-2.5 px-4">Ticker</th>
                        <th className="py-2.5 px-4">Classe</th>
                        <th className="py-2.5 px-4">Tipo</th>
                        <th className="py-2.5 px-4 text-right">Qtd</th>
                        <th className="py-2.5 px-4 text-right">Unitário</th>
                        <th className="py-2.5 px-4 text-right">Valor Líquido</th>
                        <th className="py-2.5 px-4">Origem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {dividendData.items.map((it) => (
                        <tr key={it.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-2.5 px-4 whitespace-nowrap text-slate-400 font-mono">
                            {new Date(it.trade_date).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-2.5 px-4 font-bold text-white font-mono">{it.ticker}</td>
                          <td className="py-2.5 px-4 text-[11px] text-slate-300">{it.asset_type}</td>
                          <td className="py-2.5 px-4">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {it.operation_type}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-slate-400">
                            {Number(it.quantity) > 0 ? Number(it.quantity).toLocaleString('pt-BR') : '-'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-slate-400">
                            {Number(it.unit_price) > 0 ? `R$ ${Number(it.unit_price).toFixed(2)}` : '-'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold text-emerald-400 font-mono">
                            R$ {Number(it.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 px-4 text-[10px] text-slate-400">
                            {it.source}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* SEÇÃO 3: CUSTÓDIA CONSOLIDADA & CLASSIFICAÇÃO DOS ATIVOS */}
          <div className="space-y-4">
            {/* Header da Custódia com botão Nova Operação */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <PieChart className="w-5 h-5 text-indigo-400" />
                  <span>Custódia Consolidada da Carteira</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Gerencie seus ativos, posições, preço médio e classifique cada ativo em Ações, FIIs, Internacional, Renda Fixa ou Criptos.
                </p>
              </div>
              <button
                onClick={() => setShowManualInvModal(!showManualInvModal)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/30 text-white rounded-lg text-xs font-semibold shadow-sm transition"
              >
                <PlusCircle className="w-4 h-4" /> Nova Operação Manual
              </button>
            </div>

            {/* Distribuição de Patrimônio por Classe de Ativos */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {ASSET_CLASSES.map((cls) => {
                const totalInClass = portfolio
                  .filter(p => p.asset_type === cls)
                  .reduce((acc, p) => acc + Number(p.total_invested || 0), 0);
                const totalPortfolio = portfolio.reduce((acc, p) => acc + Number(p.total_invested || 0), 0);
                const pct = totalPortfolio > 0 ? (totalInClass / totalPortfolio) * 100 : 0;
                
                return (
                  <div key={cls} className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl">
                    <div className="flex justify-between items-center text-xs text-slate-400 mb-1">
                      <span className="font-semibold truncate">{cls}</span>
                      <span className="font-bold text-slate-200 font-mono">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="text-sm font-black text-white font-mono">
                      R$ {totalInClass.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          cls === 'Ações' ? 'bg-blue-500' :
                          cls === 'Fundos Imobiliários' ? 'bg-emerald-500' :
                          cls === 'Internacional' ? 'bg-purple-500' :
                          cls === 'Renda Fixa' ? 'bg-amber-500' : 'bg-cyan-500'
                        }`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Form Operação Manual (se aberto) */}
            {showManualInvModal && (
              <form onSubmit={handleCreateManualInvestment} className="p-4 bg-slate-900 border border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
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
                  <option value="jcp">JCP</option>
                  <option value="rendimento">Rendimento FII</option>
                </select>
                <select
                  value={invAssetClass}
                  onChange={(e) => setInvAssetClass(e.target.value)}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                  title="Classificação do Ativo"
                >
                  {ASSET_CLASSES.map((cls) => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="any"
                  placeholder={['dividend', 'jcp', 'rendimento'].includes(invOpType) ? "Qtd Cotas (opcional)" : "Quantidade"}
                  value={invQty}
                  onChange={(e) => setInvQty(e.target.value)}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                  required={!['dividend', 'jcp', 'rendimento'].includes(invOpType)}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder={['dividend', 'jcp', 'rendimento'].includes(invOpType) ? "Total Recebido (R$)" : "Preço Unit. (R$)"}
                  value={invUnitPrice}
                  onChange={(e) => setInvUnitPrice(e.target.value)}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                  required
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Taxas (R$)"
                  value={invCosts}
                  onChange={(e) => setInvCosts(e.target.value)}
                  className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition"
                >
                  Salvar
                </button>
              </form>
            )}

            {/* Barra de Filtro de Classe para a Tabela de Custódia */}
            <div className="flex flex-wrap items-center gap-1.5 p-3 bg-slate-900 border border-slate-800 rounded-xl">
              <span className="text-xs font-semibold text-slate-400 mr-2">Filtrar Custódia:</span>
              <button
                type="button"
                onClick={() => setCustodiaClassFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                  custodiaClassFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow font-semibold'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
              >
                Todos ({portfolio.length})
              </button>
              {ASSET_CLASSES.map((cls) => {
                const count = portfolio.filter(p => p.asset_type === cls).length;
                return (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => setCustodiaClassFilter(cls)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                      custodiaClassFilter === cls
                        ? 'bg-indigo-600 text-white shadow font-semibold'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {cls} ({count})
                  </button>
                );
              })}
            </div>

            {/* Tabela de Custódia com Dropdown Interativo de Classificação */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Ticker</th>
                      <th className="py-3 px-4">Ativo</th>
                      <th className="py-3 px-4">Classificação (Opção de Troca)</th>
                      <th className="py-3 px-4 text-right">Qtd</th>
                      <th className="py-3 px-4 text-right">Preço Médio</th>
                      <th className="py-3 px-4 text-right">Total Investido</th>
                      <th className="py-3 px-4 text-right">Proventos Totais</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {portfolio
                      .filter(pos => custodiaClassFilter === 'all' || pos.asset_type === custodiaClassFilter)
                      .map((pos) => (
                        <tr key={pos.asset_id} className="hover:bg-slate-800/30 transition">
                          <td className="py-3 px-4 font-bold text-white font-mono">{pos.ticker}</td>
                          <td className="py-3 px-4 text-xs text-slate-300">{pos.name}</td>
                          <td className="py-3 px-4 text-xs">
                            <select
                              value={pos.asset_type || 'Ações'}
                              onChange={(e) => handleUpdateAssetClass(pos.asset_id, e.target.value)}
                              className={`px-2.5 py-1 rounded-md text-xs font-semibold border cursor-pointer focus:outline-none transition ${
                                pos.asset_type === 'Ações' ? 'bg-blue-950/70 text-blue-300 border-blue-500/30' :
                                pos.asset_type === 'Fundos Imobiliários' ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/30' :
                                pos.asset_type === 'Internacional' ? 'bg-purple-950/70 text-purple-300 border-purple-500/30' :
                                pos.asset_type === 'Renda Fixa' ? 'bg-amber-950/70 text-amber-300 border-amber-500/30' :
                                'bg-cyan-950/70 text-cyan-300 border-cyan-500/30'
                              }`}
                              title="Selecione para alterar a classificação do ativo"
                            >
                              {ASSET_CLASSES.map((cls) => (
                                <option key={cls} value={cls} className="bg-slate-900 text-white font-sans">
                                  {cls}
                                </option>
                              ))}
                            </select>
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
                        <td colSpan={8} className="py-8 text-center text-xs text-slate-500">
                          Nenhum ativo em carteira. Importe uma nota de corretagem em PDF (Sinacor) ou registre operações manuais.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* SEÇÃO 4: HISTÓRICO DE OPERAÇÕES */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Histórico Geral de Operações (Compras, Vendas e Proventos)</h3>
              <span className="text-xs text-slate-400 font-mono">{invTransactions.length} registros</span>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider border-b border-slate-800 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-4">Data</th>
                    <th className="py-2.5 px-4">Ticker</th>
                    <th className="py-2.5 px-4">Classe</th>
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
                      <td className="py-2.5 px-4 whitespace-nowrap text-slate-400 font-mono">
                        {new Date(tx.trade_date).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="py-2.5 px-4 font-bold text-white font-mono">{tx.ticker}</td>
                      <td className="py-2.5 px-4 text-[11px] text-slate-400">{tx.asset_type}</td>
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

            <form onSubmit={handleCalculateSwap} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-9 gap-3">
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
              <div className="sm:col-span-2 lg:col-span-9 flex justify-end">
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
                <label className="cursor-pointer text-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5">
                  <UploadCloud className="w-4 h-4" />
                  {isSummarizingReport ? "Analisando com IA..." : "Selecionar PDF do Relatório"}
                  <input type="file" accept=".pdf" onChange={handleUploadReport} disabled={isSummarizingReport} className="hidden" />
                </label>
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
            <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-indigo-400" /> Adicionar Nova Conta ou Cartão
            </h2>
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
          {/* Barra de Filtro por Período para Categorias */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-semibold text-slate-300 mr-1">Período de Análise das Categorias:</span>
              <div className="flex flex-wrap gap-1.5">
                {PERIOD_OPTIONS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => handleCategoryPeriodChange(p.value)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                      categoryPeriod === p.value
                        ? 'bg-indigo-600 text-white shadow'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <span className="text-xs text-slate-400">
              Saldos do período: <strong className="text-indigo-300">{getPeriodLabel(categoryPeriod)}</strong>
            </span>
          </div>
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
                <option value="both">Mista (Receitas & Despesas)</option>
                <option value="expense">Predominante Despesa</option>
                <option value="income">Predominante Receita</option>
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

          {/* Indicadores Globais das Categorias */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400 block">Total de Categorias</span>
              <span className="text-2xl font-bold text-white mt-1 block">{categories.length}</span>
              <span className="text-[11px] text-slate-500">Categorias ativas no sistema</span>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400 block">Categorias com Saldo Credor</span>
              <span className="text-2xl font-bold text-emerald-400 mt-1 block">
                {categories.filter(c => (c.balance || 0) > 0).length}
              </span>
              <span className="text-[11px] text-slate-500">Mais entradas que saídas</span>
            </div>
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-400 block">Categorias com Saldo Devedor</span>
              <span className="text-2xl font-bold text-rose-400 mt-1 block">
                {categories.filter(c => (c.balance || 0) < 0).length}
              </span>
              <span className="text-[11px] text-slate-500">Mais saídas que entradas</span>
            </div>
          </div>

          {/* Grid de Cards Ricos com Saldo de Cada Categoria */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => {
              const bal = cat.balance || 0;
              const inc = cat.total_income || 0;
              const exp = cat.total_expense || 0;
              const totFlow = inc + exp;
              return (
                <div
                  key={cat.id}
                  className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-col justify-between hover:border-slate-700/80 transition shadow-sm"
                >
                  <div>
                    {/* Header do Card */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                          style={{ backgroundColor: cat.color || '#3b82f6' }}
                        />
                        <div>
                          <h3 className="text-sm font-semibold text-white tracking-tight">{cat.name}</h3>
                          <span className="text-[10px] text-slate-400">
                            {cat.transactions_count || 0} lançamento(s)
                          </span>
                        </div>
                      </div>

                      {cat.user_id !== null && (
                        <button
                          onClick={() => handleDeleteCategory(cat.id)}
                          title="Excluir categoria personalizada"
                          className="p-1 text-slate-500 hover:text-rose-400 rounded transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Saldo Líquido da Categoria */}
                    <div className="my-3 p-3 bg-slate-800/40 border border-slate-800 rounded-lg">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-medium">Saldo Líquido</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          bal > 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          bal < 0 ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {bal > 0 ? 'Crédito Líquido' : bal < 0 ? 'Débito Líquido' : 'Neutro'}
                        </span>
                      </div>
                      <div className={`text-xl font-bold font-mono mt-1 ${
                        bal > 0 ? 'text-emerald-400' :
                        bal < 0 ? 'text-rose-400' :
                        'text-slate-300'
                      }`}>
                        {bal > 0 ? '+' : ''} R$ {bal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    {/* Detalhamento de Entradas vs Saídas */}
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-emerald-400 font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Entradas (Créditos)
                        </span>
                        <span className="font-mono text-emerald-400 font-semibold">
                          + R$ {inc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-rose-400 font-medium flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Saídas (Débitos)
                        </span>
                        <span className="font-mono text-rose-400 font-semibold">
                          - R$ {exp.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      {/* Barra Proporcional interna da categoria */}
                      {totFlow > 0 && (
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden flex mt-2">
                          <div
                            className="bg-emerald-500 h-full transition-all duration-500"
                            style={{ width: `${(inc / totFlow) * 100}%` }}
                            title={`Créditos: R$ ${inc.toFixed(2)}`}
                          />
                          <div
                            className="bg-rose-500 h-full transition-all duration-500"
                            style={{ width: `${(exp / totFlow) * 100}%` }}
                            title={`Débitos: R$ ${exp.toFixed(2)}`}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {/* Modal de Diagnostico Open Finance */}
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
                    <span className={it.status === 'UPDATED' ? 'px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/20 text-emerald-300' : 'px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-500/20 text-amber-300'}>
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

      {/* MODAL DE CHANGELOG / HISTÓRICO DE VERSÕES */}
      {showChangelogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-fade-in">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white">Histórico de Versões & Novidades</h2>
                    <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      v2.2
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Acompanhe a evolução, novos recursos e melhorias da plataforma financeira.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowChangelogModal(false)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-sm transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Body: Timeline de Versões */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-300">
              {/* VERSÃO 2.1 (ATUAL) */}
              <div className="relative pl-6 border-l-2 border-indigo-500 space-y-2">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-indigo-500 ring-4 ring-slate-900 flex items-center justify-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-white text-sm">Versão 2.2</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-semibold">
                    Versão Atual
                  </span>
                  <span className="text-slate-500 text-[11px]">Setembro / 2026</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Refinamento e correções prioritárias de visualização, ordenação e cálculo de proventos:
                </p>
                <ul className="space-y-1.5 list-disc list-inside text-slate-300 ml-1">
                  <li>
                    <strong className="text-white">Correção de Proventos por Período:</strong> Revisão profunda do cálculo de dividendos com vinculação estrita à carteira de investimentos (expurgando depósitos bancários, salários e contas remuneradas) e limites temporais fechados para o mês atual.
                  </li>
                  <li>
                    <strong className="text-white">Histórico em Ordem Decrescente:</strong> As consultas de dados históricos (Evolução Mensal, Matriz Financeira e Histórico de Proventos) agora exibem o mês atual no topo/início, seguido pelos meses mais antigos.
                  </li>
                  <li>
                    <strong className="text-white">Colunas Redimensionáveis & Responsivas:</strong> Tabela de transações com controle interativo de largura por arrasto de mouse nas bordas das colunas e ajuste automático para que a coluna Valor fique sempre 100% visível na tela.
                  </li>
                </ul>
              </div>

              {/* VERSÃO 2.0 */}
              <div className="relative pl-6 border-l-2 border-slate-700 space-y-2">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-700 ring-4 ring-slate-900"></div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-slate-200 text-sm">Versão 2.0</span>
                  <span className="text-slate-500 text-[11px]">Setembro / 2026</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Versão com foco em inteligência orçamentária, análise comportamental de gastos e controle avançado de investimentos:
                </p>
                <ul className="space-y-1.5 list-disc list-inside text-slate-300 ml-1">
                  <li>
                    <strong className="text-white">Classificação Recorrente vs. Futilidade:</strong> Nova coluna interativa no extrato de lançamentos permitindo classificar gastos entre habituais/essenciais e supérfluos, com padrão automático como <em>Recorrente</em>.
                  </li>
                  <li>
                    <strong className="text-white">Dashboard de Futilidades:</strong> Painel de consolidação por período comparando o montante e percentual gasto em Recorrentes vs. Futilidades, com barra de proporção e ranking das categorias que mais consumiram gastos supérfluos.
                  </li>
                  <li>
                    <strong className="text-white">Filtro de Lançamentos por Natureza:</strong> Seleção rápida no extrato para auditar apenas despesas recorrentes ou apenas futilidades, integrado à exportação em Excel (.xlsx).
                  </li>
                  <li>
                    <strong className="text-white">Classificação Padronizada de Ativos:</strong> Organização da carteira em 5 classes oficiais (<em>Ações</em>, <em>Fundos Imobiliários</em>, <em>Internacional</em>, <em>Renda Fixa</em> e <em>Criptos</em>) com seletor interativo na custódia e barra de alocação patrimonial.
                  </li>
                  <li>
                    <strong className="text-white">Visualização de Dividendos por Período:</strong> Seção dedicada com filtro temporal unificado (Mês atual, 30d, mês anterior, 60d, 90d, esse ano, 12m), consolidando por ativo e desconsiderando ativos de Renda Fixa.
                  </li>
                  <li>
                    <strong className="text-white">Identificação da Aplicação (v2.0):</strong> Selo de versão ao lado do título com modal interativo de histórico de versões.
                  </li>
                </ul>
              </div>

              {/* VERSÃO 1.5 */}
              <div className="relative pl-6 border-l-2 border-slate-700 space-y-2">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-700 ring-4 ring-slate-900"></div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-200 text-sm">Versão 1.5</span>
                  <span className="text-slate-500 text-[11px]">Setembro / 2026</span>
                </div>
                <ul className="space-y-1.5 list-disc list-inside text-slate-400 ml-1">
                  <li>
                    <strong className="text-slate-300">Filtro Padronizado por Período:</strong> Opções unificadas (<em>Mês atual, 30 dias, mês anterior, 60 dias, 90 dias, esse ano e últimos 12 meses</em>) no Dashboard, Extrato e Categorias.
                  </li>
                  <li>
                    <strong className="text-slate-300">Não Contabilizar Lançamentos:</strong> Opção de desmarcar transações (como transferências internas e estornos) para não inflar receitas e despesas nos gráficos.
                  </li>
                  <li>
                    <strong className="text-slate-300">Exportação Nativa para Excel (.xlsx):</strong> Download de extrato contábil formatado com fórmulas de totais e filtros aplicados.
                  </li>
                </ul>
              </div>

              {/* VERSÃO 1.4 */}
              <div className="relative pl-6 border-l-2 border-slate-800 space-y-2">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-800 ring-4 ring-slate-900"></div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-200 text-sm">Versão 1.4</span>
                  <span className="text-slate-500 text-[11px]">Setembro / 2026</span>
                </div>
                <ul className="space-y-1.5 list-disc list-inside text-slate-400 ml-1">
                  <li>
                    <strong className="text-slate-300">Estrutura de Custos Fixos vs. Variáveis:</strong> Separação de custos contratuais e recorrentes para avaliação de flexibilidade orçamentária.
                  </li>
                  <li>
                    <strong className="text-slate-300">Evolução Histórica Mensal:</strong> Mapeamento mês a mês de receitas, despesas e saldo líquido.
                  </li>
                  <li>
                    <strong className="text-slate-300">Painel de Diagnóstico Open Finance:</strong> Inspeção técnica detalhada de contas e investimentos retornados pelas conexões bancárias.
                  </li>
                </ul>
              </div>

              {/* VERSÃO 1.0 */}
              <div className="relative pl-6 border-l-2 border-slate-800 space-y-2">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-slate-800 ring-4 ring-slate-900"></div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-200 text-sm">Versão 1.0</span>
                  <span className="text-slate-500 text-[11px]">Setembro / 2026</span>
                </div>
                <ul className="space-y-1.5 list-disc list-inside text-slate-400 ml-1">
                  <li>Lançamento inicial da plataforma com sincronização bancária Open Finance via Pluggy.</li>
                  <li>Autocategorização de despesas com inteligência artificial local (Ollama).</li>
                  <li>Importação de notas de corretagem da B3 no formato Sinacor (PDF) e gestão consolidada de carteira.</li>
                </ul>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
              <button
                type="button"
                onClick={() => setShowChangelogModal(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition shadow"
              >
                Entendi / Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
