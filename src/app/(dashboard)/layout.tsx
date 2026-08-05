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
      enableSystem
      disableTransitionOnChange
    >
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                const theme = localStorage.getItem('kspot-theme') || 'dark';
                document.documentElement.setAttribute('data-theme', theme);
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