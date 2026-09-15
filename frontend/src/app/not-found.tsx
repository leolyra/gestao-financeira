import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl max-w-md w-full text-center shadow-xl">
        <h2 className="text-lg font-bold text-slate-200 mb-2">Página não encontrada</h2>
        <p className="text-sm text-slate-400 mb-6">
          A rota solicitada não existe no sistema.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-medium text-sm transition"
        >
          Voltar ao Início
        </Link>
      </div>
    </div>
  );
}
