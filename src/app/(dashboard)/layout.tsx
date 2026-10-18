// src/app/(dashboard)/layout.tsx
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Temporar fără auth
  // const { userId } = await auth();
  // if (!userId) {
  //   redirect('/auth/sign-in');
  // }

  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="dark"
      themes={['light', 'dark']}
      storageKey="kspot-theme"
      enableSystem={false}
      disableTransitionOnChange
    >
      {/* Rulează după scriptul injectat de next-themes și normalizează valorile
          vechi din localStorage (ex. „amber", temă eliminată) la `dark`, ca
          `data-theme` să rămână mereu pe una dintre cele două teme cu reguli CSS. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                var t = localStorage.getItem('kspot-theme');
                if (t !== 'light' && t !== 'dark') {
                  t = 'dark';
                  localStorage.setItem('kspot-theme', t);
                }
                document.documentElement.setAttribute('data-theme', t);
              } catch (e) {}
            })();
          `,
        }}
      />
      <div className="flex h-screen bg-stone-900 text-gray-100">
        <Sidebar />

        <div className="flex-1 flex flex-col overflow-hidden bg-stone-900">
          {/* Header cu search si add client */}
          <Header />

        <main className="flex-1 overflow-y-auto">
          <div className="p-6 lg:p-8">
            {children}
          </div>
        </main>
        </div>
      </div>
      <Toaster />
    </ThemeProvider>
  );
}