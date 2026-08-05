// src/app/(auth)/layout.tsx

import type { ReactNode } from 'react';

export default function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center relative overflow-hidden">
      {/* Fundal gradient închis, sofisticat */}
      <div className="absolute inset-0 bg-gradient-to-br from-neutral-950 via-neutral-900 to-black" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-neutral-950/30" />
      
      {/* Particule subtile de accent orange (opțional, pentru vibe premium) */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-10 w-72 h-72 bg-orange-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-orange-700/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md p-6">


        {/* Card principal – stil identic cu dashboard-ul */}
        <div className="bg-neutral-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-neutral-800 p-8 ring-1 ring-neutral-700/50">
          {children}
        </div>

        <p className="text-center text-xs text-neutral-500 mt-8">
          Prin continuare, accepți{' '}
          <a href="/privacy-policy" className="text-orange-500 hover:text-orange-400 hover:underline transition">
            Politica de Confidențialitate
          </a>{' '}
          și{' '}
          <a href="/terms" className="text-orange-500 hover:text-orange-400 hover:underline transition">
            Termenii de Utilizare
          </a>
        </p>
      </div>
    </div>
  );
}