'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (error) {
      console.error('App Router error boundary caught:', error.message || error);
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl max-w-md w-full text-center shadow-xl">
        <h2 className="text-lg font-bold text-red-400 mb-2">Ops! Ocorreu um problema</h2>
        <p className="text-sm text-slate-400 mb-6">
          O painel encontrou uma instabilidade momentânea na renderização.
        </p>
        <button
          onClick={() => reset()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-medium text-sm transition"
        >
          Recarregar Painel
        </button>
      </div>
    </div>
  );
}
