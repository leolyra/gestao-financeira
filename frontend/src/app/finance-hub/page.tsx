"use client";
import { useEffect, useState } from "react";
import { fetchWithAuth } from "@/lib/api";

const brl=(v:any)=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
type Hub= { net:any; investments:any; forecast:any; calendar:any[]; insights:any; goals:any[]; fire:any };
export default function FinanceHubPage(){
  const [hub,setHub]=useState<Hub>({net:null,investments:null,forecast:null,calendar:[],insights:null,goals:[],fire:null});
  const [loading,setLoading]=useState(true),[error,setError]=useState("");
  const [goalName,setGoalName]=useState(""),[goalAmount,setGoalAmount]=useState(""),[goalCurrent,setGoalCurrent]=useState("0");
  const [ticker,setTicker]=useState(""),[quote,setQuote]=useState("");
  async function load(){
    setLoading(true);setError("");
    try{
      const endpoints=["/financial-hub/net-worth","/financial-hub/investment-dashboard","/financial-hub/cash-flow-forecast?months=6","/financial-hub/calendar?days=120","/financial-hub/insights","/financial-hub/goals","/financial-hub/fire-simulator"];
      const rs=await Promise.all(endpoints.map(x=>fetchWithAuth(x)));
      const data=await Promise.all(rs.map(async r=>r.ok?await r.json():null));
      setHub({net:data[0],investments:data[1],forecast:data[2],calendar:data[3]||[],insights:data[4],goals:data[5]||[],fire:data[6]});
    }catch(e:any){setError(e.message||"Falha ao carregar dados.");}finally{setLoading(false);}
  }
  useEffect(()=>{load();},[]);
  async function createGoal(e:any){e.preventDefault();const r=await fetchWithAuth("/financial-hub/goals",{method:"POST",body:JSON.stringify({name:goalName,target_amount:goalAmount,current_amount:goalCurrent})});if(!r.ok){setError("Não foi possível criar a meta.");return;}setGoalName("");setGoalAmount("");setGoalCurrent("0");load();}
  async function deleteGoal(id:number){if(!confirm("Excluir esta meta?"))return;await fetchWithAuth("/financial-hub/goals/"+id,{method:"DELETE"});load();}
  async function saveQuote(e:any){e.preventDefault();const r=await fetchWithAuth("/financial-hub/quotes",{method:"POST",body:JSON.stringify({ticker,price:quote,currency:"BRL"})});if(!r.ok){setError("Não foi possível salvar a cotação. Verifique o ticker.");return;}setTicker("");setQuote("");load();}
  const n=hub.net, inv=hub.investments, fc=hub.forecast, fire=hub.fire;
  return <main className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
    <div className="max-w-7xl mx-auto space-y-6">
      <header className="flex flex-wrap justify-between items-center gap-3">
        <div><a href="/" className="text-indigo-400 text-sm hover:underline">← Voltar à Gestão Financeira</a><h1 className="text-3xl font-bold mt-2">Central Patrimonial</h1><p className="text-slate-400 text-sm">Patrimônio, carteira, fluxo de caixa, metas e planejamento financeiro.</p></div>
        <button onClick={load} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm hover:bg-indigo-500">Atualizar dados</button>
      </header>
      {error&&<div className="rounded-lg border border-rose-800 bg-rose-950/40 p-3 text-rose-200">{error}</div>}
      {loading?<div className="text-slate-400 py-16 text-center">Carregando dados financeiros…</div>:<>
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {[["Patrimônio líquido",n?.net_worth],["Saldo em bancos",n?.cash_and_bank_accounts],["Investimentos a mercado",n?.investment_market_value],["Dívidas de cartões",n?.credit_card_liabilities]].map(([label,value]:any)=><article key={label} className="rounded-xl border border-slate-800 bg-slate-900 p-5"><p className="text-sm text-slate-400">{label}</p><p className="text-2xl font-semibold mt-2">{brl(value)}</p></article>)}
      </section>
      {n?.quote_missing?.length>0&&<p className="text-amber-300 text-sm">Sem cotação atual para: {n.quote_missing.join(", ")}. Informe uma cotação ou aguarde a próxima sincronização Open Finance.</p>}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <article className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
          <h2 className="text-xl font-semibold">Carteira de investimentos</h2>
          <div className="grid grid-cols-2 gap-3"><div><p className="text-xs text-slate-400">Custo da carteira</p><p className="text-lg">{brl(inv?.total_cost_basis)}</p></div><div><p className="text-xs text-slate-400">Valor de mercado</p><p className="text-lg">{brl(inv?.total_market_value)}</p></div></div>
          <p className="text-sm text-slate-300">Resultado não realizado: <b>{brl(inv?.unrealized_gain)}</b></p>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="text-slate-400"><tr><th className="text-left py-2">Ativo</th><th className="text-right">Qtd.</th><th className="text-right">Preço</th><th className="text-right">Mercado</th></tr></thead><tbody>{(inv?.positions||[]).map((p:any)=><tr key={p.asset_id} className="border-t border-slate-800"><td className="py-2">{p.ticker}<div className="text-xs text-slate-500">{p.asset_type}</div></td><td className="text-right">{Number(p.quantity).toLocaleString("pt-BR")}</td><td className="text-right">{p.current_price?brl(p.current_price):"—"}</td><td className="text-right">{p.market_value?brl(p.market_value):"Sem cotação"}</td></tr>)}</tbody></table></div>
          <form onSubmit={saveQuote} className="grid grid-cols-3 gap-2 border-t border-slate-800 pt-3"><input className="min-w-0 rounded bg-slate-800 p-2 text-sm" placeholder="Ticker" value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())} required/><input className="min-w-0 rounded bg-slate-800 p-2 text-sm" type="number" step="0.0001" placeholder="Cotação R$" value={quote} onChange={e=>setQuote(e.target.value)} required/><button className="rounded bg-indigo-600 px-2 text-sm">Salvar cotação</button></form>
        </article>
        <article className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
          <h2 className="text-xl font-semibold">Projeção de fluxo de caixa</h2><p className="text-xs text-slate-400">Média histórica simples dos últimos 180 dias. Não é previsão garantida.</p>
          <div className="grid grid-cols-2 gap-3"><div><p className="text-xs text-slate-400">Receita mensal média</p><p className="text-lg text-emerald-300">{brl(fc?.average_monthly_income)}</p></div><div><p className="text-xs text-slate-400">Despesa mensal média</p><p className="text-lg text-rose-300">{brl(fc?.average_monthly_expenses)}</p></div></div>
          <div className="space-y-2">{(fc?.forecast||[]).map((m:any)=><div key={m.month} className="flex justify-between border-t border-slate-800 pt-2 text-sm"><span>{m.month}</span><span className={m.projected_net>=0?"text-emerald-300":"text-rose-300"}>{brl(m.projected_net)}</span></div>)}</div>
        </article>
      </section>
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <article className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
          <h2 className="text-xl font-semibold">Metas financeiras</h2>
          <form onSubmit={createGoal} className="grid grid-cols-1 md:grid-cols-4 gap-2"><input className="rounded bg-slate-800 p-2 text-sm" placeholder="Nome da meta" value={goalName} onChange={e=>setGoalName(e.target.value)} required/><input className="rounded bg-slate-800 p-2 text-sm" type="number" min="0.01" step="0.01" placeholder="Valor alvo" value={goalAmount} onChange={e=>setGoalAmount(e.target.value)} required/><input className="rounded bg-slate-800 p-2 text-sm" type="number" min="0" step="0.01" placeholder="Valor atual" value={goalCurrent} onChange={e=>setGoalCurrent(e.target.value)}/><button className="rounded bg-indigo-600 p-2 text-sm">Criar meta</button></form>
          {(hub.goals||[]).map((g:any)=><div key={g.id} className="border-t border-slate-800 pt-3"><div className="flex justify-between gap-2"><b>{g.name}</b><span className="flex gap-3"><button onClick={async()=>{const value=prompt("Novo valor acumulado da meta",String(g.current_amount));if(value===null)return;const r=await fetchWithAuth("/financial-hub/goals/"+g.id,{method:"PATCH",body:JSON.stringify({name:g.name,target_amount:g.target_amount,current_amount:value,target_date:g.target_date,category:g.category})});if(r.ok)load();else setError("Não foi possível atualizar a meta.");}} className="text-xs text-indigo-300">Atualizar valor</button><button onClick={()=>deleteGoal(g.id)} className="text-xs text-rose-300">Excluir</button></span></div><p className="text-sm text-slate-400">{brl(g.current_amount)} de {brl(g.target_amount)}</p><div className="h-2 rounded bg-slate-800 mt-2"><div className="h-2 rounded bg-emerald-500" style={{width:Math.min(100,Number(g.current_amount)/Number(g.target_amount)*100)+"%"}}/></div></div>)}
          {!hub.goals?.length&&<p className="text-sm text-slate-500">Nenhuma meta cadastrada.</p>}
        </article>
        <article className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
          <h2 className="text-xl font-semibold">Independência financeira</h2><p className="text-xs text-slate-400">Estimativa baseada nas despesas observadas, aporte mensal inferido e retorno nominal anual de 6%.</p>
          <div className="grid grid-cols-2 gap-3"><div><p className="text-xs text-slate-400">Patrimônio-alvo (regra de retirada)</p><p className="text-lg">{brl(fire?.financial_independence_target)}</p></div><div><p className="text-xs text-slate-400">Prazo estimado</p><p className="text-lg">{fire?.projected_years?fire.projected_years+" anos":"Não estimável"}</p></div></div>
          <p className="text-sm text-slate-300">Aporte mensal considerado: {brl(fire?.monthly_contribution_assumed)}</p><p className="text-xs text-amber-300">{fire?.assumptions}</p>
        </article>
      </section>
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <article className="rounded-xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-semibold mb-3">Calendário de faturas</h2>{hub.calendar.length?hub.calendar.map((b:any,i)=><div key={i} className="flex justify-between border-t border-slate-800 py-2 text-sm"><span>{b.title} · {new Date(b.date).toLocaleDateString("pt-BR")}</span><b>{brl(b.amount)}</b></div>):<p className="text-sm text-slate-500">Não há faturas futuras registradas. A sincronização de faturas precisa estar disponível na instituição.</p>}</article>
        <article className="rounded-xl border border-slate-800 bg-slate-900 p-5"><h2 className="text-xl font-semibold mb-3">Alertas e oportunidades</h2>{(hub.insights?.insights||[]).length?hub.insights.insights.map((x:any,i)=><div key={i} className="border-t border-slate-800 py-2 text-sm"><b>{x.type==="spending_spike"?"Aumento de despesas":x.type==="recurring_charges"?"Cobranças recorrentes / assinaturas":"Possíveis lançamentos repetidos"}</b><p className="text-slate-400">{x.message||x.count+" grupos identificados. Verifique antes de excluir."}</p></div>):<p className="text-sm text-slate-500">Nenhum alerta heurístico encontrado nos últimos 90 dias.</p>}<p className="text-xs text-amber-300 mt-3">Alertas são sugestões para revisão, não exclusões automáticas.</p></article>
      </section>
      </>}
    </div>
  </main>;
}
