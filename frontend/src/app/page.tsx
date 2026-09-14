'use client';

import { useState, useEffect } from 'react';
import { 
  Wallet, 
  TrendingUp, 
  Bell, 
  CreditCard, 
  PlusCircle, 
  Trash2, 
  LogOut, 
  Tag, 
  LayoutDashboard,
  Building2,
  CheckCircle2
} from 'lucide-react';
import { fetchWithAuth, setToken, getToken, removeToken } from '@/lib/api';

interface Account {
  id: number;
  name: string;
  type: string;
  balance: number;
}

interface Category {
  id: number;
  name: string;
  type: string;
  color: string;
}

export default function Home() {
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'accounts' | 'categories'>('overview');

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

  // Account Form
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState('checking');
  const [newAccBalance, setNewAccBalance] = useState('');

  // Category Form
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState('expense');
  const [newCatColor, setNewCatColor] = useState('#3b82f6');

  useEffect(() => {
    const savedToken = getToken();
    if (savedToken) {
      setTokenState(savedToken);
      loadUserData();
    } else {
      setLoading(false);
    }
  }, []);

  async function loadUserData() {
    try {
      const [meRes, accRes, catRes] = await Promise.all([
        fetchWithAuth('/auth/me'),
        fetchWithAuth('/accounts/'),
        fetchWithAuth('/categories/')
      ]);

      if (meRes.ok) {
        const meData = await meRes.json();
        setUser(meData);
      }
      if (accRes.ok) {
        const accData = await accRes.json();
        setAccounts(accData);
      }
      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData);
      }
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
      loadUserData();
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
  }

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

  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.type !== 'credit_card' ? Number(acc.balance) : 0), 0);

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
            Olá, <strong className="text-slate-200">{user?.name || 'Usuário'}</strong>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-medium flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Open Finance
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg text-xs transition"
          >
            <LogOut className="w-3.5 h-3.5" /> Sair
          </button>
        </div>
      </header>

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

      {/* ABA 1: VISÃO GERAL */}
      {activeTab === 'overview' && (
        <section className="mt-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-sm font-medium">Saldo Total Líquido</span>
                <Wallet className="w-5 h-5 text-indigo-400" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-white">
                  R$ {totalBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <p className="text-xs text-slate-400 mt-1">Soma de {accounts.length} contas cadastradas</p>
              </div>
            </div>

            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-sm font-medium">Patrimônio em Ativos</span>
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-white">R$ 0,00</span>
                <p className="text-xs text-slate-400 mt-1">Ações, FIIs, Renda Fixa e ETFs</p>
              </div>
            </div>

            <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl sm:col-span-2 lg:col-span-1">
              <div className="flex justify-between items-center text-slate-400">
                <span className="text-sm font-medium">Monitoramento de Ativos</span>
                <Bell className="w-5 h-5 text-amber-400" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-bold text-white">0 Alertas</span>
                <p className="text-xs text-slate-400 mt-1">Ollama local pronto para relatórios</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ABA 2: CONTAS E CARTÕES */}
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
                  <span className="text-sm font-bold text-white">
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
            {accounts.length === 0 && (
              <p className="text-xs text-slate-500 col-span-full py-4 text-center">
                Nenhuma conta cadastrada ainda.
              </p>
            )}
          </div>
        </section>
      )}

      {/* ABA 3: CATEGORIAS */}
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
    </main>
  );
}
