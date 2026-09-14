import { Wallet, TrendingUp, Bell } from "lucide-react";

export default function Home() {
  return (
    <main className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b border-slate-800 gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Painel Financeiro</h1>
          <p className="text-sm text-slate-400">Visão consolidada de fluxo de caixa e investimentos</p>
        </div>
        <div>
          <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-medium">Open Finance Ativo</span>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-sm font-medium">Saldo em Conta</span>
            <Wallet className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="mt-3"><span className="text-2xl font-bold text-white">R$ 0,00</span></div>
        </div>

        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-sm font-medium">Patrimônio Investido</span>
            <TrendingUp className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="mt-3"><span className="text-2xl font-bold text-white">R$ 0,00</span></div>
        </div>

        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl sm:col-span-2 lg:col-span-1">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-sm font-medium">Alertas de Ativos</span>
            <Bell className="w-5 h-5 text-amber-400" />
          </div>
          <div className="mt-3"><span className="text-2xl font-bold text-white">0</span></div>
        </div>
      </section>
    </main>
  );
}
