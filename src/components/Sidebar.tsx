// src/components/Sidebar.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { UserButton, useUser } from '@clerk/nextjs';
import {
  LayoutDashboard,
  Calendar,
  ChevronLeft,
  Menu,
  Mail,
  BookOpen,
  Target,
} from 'lucide-react';
import Link from 'next/link';

const menuItems = [
  { name: 'Overview',    href: '/overview',                icon: LayoutDashboard },
  { name: 'Bookings',   href: '/bookings',                icon: Calendar },
  { name: 'Chats',  href: '/messaging',               icon: Mail },
  { name: 'Emails',  href: '/educational-templates',   icon: BookOpen },
  { name: 'Lead Generation', href: '/lead-generation',     icon: Target },
];

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { user, isLoaded } = useUser();
  const [theme, setTheme] = useState<'light' | 'dark' | 'amber'>('dark');

  useEffect(() => {
    const savedTheme = localStorage.getItem('kspot-theme') as 'light' | 'dark' | 'amber';
    if (savedTheme) {
      setTheme(savedTheme);
    }

    const interval = setInterval(() => {
      const newTheme = localStorage.getItem('kspot-theme') as 'light' | 'dark' | 'amber';
      if (newTheme) {
        setTheme((prev) => (prev === newTheme ? prev : newTheme));
      }
    }, 500);

    return () => clearInterval(interval);
    // rulează o singură dată la mount — citește tema curentă prin funcția de update,
    // nu prin dependency, ca să nu recreeze interval-ul la fiecare schimbare
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bgClass = theme === 'light' ? 'bg-stone-100' : theme === 'amber' ? 'bg-amber-950' : 'bg-stone-900';
  const textClass = theme === 'light' ? 'text-stone-900' : 'text-white';
  const borderClass = theme === 'light' ? 'border-stone-300' : theme === 'amber' ? 'border-amber-900/50' : 'border-stone-800/60';
  const mutedClass = theme === 'light' ? 'text-stone-600' : 'text-stone-500';

  return (
    <>
      {/* Overlay doar pe mobil când sidebar-ul e deschis */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:relative inset-y-0 left-0 z-50 flex flex-col ${bgClass} border-r ${borderClass} transition-all duration-300 ${
        isCollapsed ? 'w-[72px]' : 'w-60'
      } ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        {/* Logo */}
        <div className={`flex items-center justify-between h-16 px-4  ${borderClass}`}>
          <Link href="/overview" className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0 shadow-md shadow-amber-500/20">
              <span className="text-black font-bold text-base tracking-tight">C</span>
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${textClass} tracking-wide truncate`}>CRM Tools</p>
                <p className={`text-[10px] ${mutedClass} uppercase tracking-[0.15em]`}>Utopia CRM</p>
              </div>
            )}
          </Link>

          <button onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 rounded-lg hover:bg-stone-800 transition-colors hidden lg:flex items-center justify-center flex-shrink-0">
            <ChevronLeft className={`h-4 w-4 text-stone-500 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} />
          </button>
          <button onClick={() => setIsMobileOpen(false)}
            className="p-1.5 rounded-lg hover:bg-stone-800 lg:hidden">
            <ChevronLeft className="h-4 w-4 text-stone-500" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 overflow-y-auto">
          {!isCollapsed && (
            <p className="text-[10px] text-stone-700 uppercase tracking-[0.18em] font-medium px-3 mb-3">Navigare</p>
          )}
          <ul className="space-y-1">
            {menuItems.map(item => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <li key={item.name}>
                  <button
                    onClick={() => { window.location.href = item.href; setIsMobileOpen(false); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                      isActive
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        : 'text-stone-400 hover:bg-stone-800/80 hover:text-stone-200 border border-transparent'
                    } ${isCollapsed ? 'justify-center' : ''}`}
                    title={isCollapsed ? item.name : undefined}
                  >
                    <Icon className={`h-4 w-4 flex-shrink-0 transition-colors ${isActive ? 'text-amber-400' : 'text-stone-500 group-hover:text-stone-300'}`} />
                    {!isCollapsed && <span>{item.name}</span>}
                    {isActive && !isCollapsed && <span className="ml-auto w-1 h-1 rounded-full bg-amber-400" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User */}
        <div className="p-3 border-t mb-2 border-stone-800/60">
          <div className={`flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-stone-800/50 transition-colors ${isCollapsed ? 'justify-center' : ''}`}>
            {isLoaded && user ? (
              <>
                <UserButton afterSignOutUrl="/auth/sign-in" />
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-stone-300 truncate">{user.firstName} {user.lastName || ''}</p>
                    <p className="text-[10px] text-stone-600 truncate">{user.primaryEmailAddress?.emailAddress}</p>
                  </div>
                )}
              </>
            ) : (
              // Loading or no user
              <>
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-stone-300 truncate">Cont CRM</p>
                    <p className="text-[10px] text-stone-600 truncate">Autentificat</p>
                  </div>
                )}
                <div className="w-8 h-8 rounded-lg bg-stone-800 flex items-center justify-center">
                  <span className="text-stone-400 text-xs">U</span>
                </div>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile FAB */}
      <button onClick={() => setIsMobileOpen(true)}
        className="fixed bottom-6 right-6 z-50 lg:hidden bg-amber-500 hover:bg-amber-400 text-black p-3.5 rounded-full shadow-xl shadow-amber-500/25 transition-all active:scale-95">
        <Menu className="h-5 w-5" />
      </button>
    </>
  );
}