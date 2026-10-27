// src/components/Sidebar.tsx
'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { UserButton, useUser } from '@clerk/nextjs';
import {
  LayoutDashboard,
  Calendar,
  ChevronLeft,
  Menu,
  Mail,
  BookOpen,
  Target,
  Bot,
  Database,
  Workflow,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

const menuItems = [
  { name: 'Overview',    href: '/overview',                icon: LayoutDashboard },
  { name: 'Bookings',   href: '/bookings',                icon: Calendar },
  { name: 'Chats',  href: '/messaging',               icon: Mail },
  { name: 'Emails',  href: '/educational-templates',   icon: BookOpen },
  { name: 'Lead Generation', href: '/lead-generation',     icon: Target },
  { name: 'Leads',       href: '/leads',                   icon: Database },
  { name: 'Pipeline',    href: '/pipeline',                icon: Workflow },
  { name: 'AI Follow-Up', href: '/dashboard/follow-ups-ai', icon: Bot },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const { user, isLoaded } = useUser();
  // Culorile vin din scara de culori a temei (globals.css), nu din JS —
  // aceleași clase dau nuanțele corecte și pe light, și pe dark.
  const bgClass = 'bg-stone-900';
  const textClass = 'text-stone-100';
  const borderClass = 'border-stone-800/60';
  const mutedClass = 'text-stone-500';

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
        {/* Pe 72px (collapsed) logo-ul + butonul nu încap pe același rând: containerul
            se strânge, iar `max-width:100%` din preflight ar turti imaginea. De aceea
            butonul de extindere trece pe rândul de dedesubt când e collapsed. */}
        <div className={`flex items-center h-16 ${isCollapsed ? 'justify-center px-2' : 'justify-between px-4'} ${borderClass}`}>
          <Link href="/overview" className="flex items-center gap-3 min-w-0 shrink-0">
            {/* Logo-ul are deja fundal și colțuri rotunjite în imagine */}
            <Image
              src="/favicon-96x96.png"
              alt="Utopia CRM"
              width={36}
              height={36}
              priority
              className="w-9 h-9 max-w-none shrink-0 rounded-xl shadow-md shadow-black/30"
            />
            {!isCollapsed && (
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${textClass} tracking-wide truncate`}>CRM Tools</p>
                <p className={`text-[10px] ${mutedClass} uppercase tracking-[0.15em]`}>Utopia CRM</p>
              </div>
            )}
          </Link>

          {!isCollapsed && (
            <>
              <button onClick={() => setIsCollapsed(true)}
                title="Restrânge meniul"
                className="p-1.5 rounded-lg hover:bg-stone-800 transition-colors hidden lg:flex items-center justify-center shrink-0">
                <ChevronLeft className="h-4 w-4 text-stone-500 transition-transform duration-300" />
              </button>
              <button onClick={() => setIsMobileOpen(false)}
                className="p-1.5 rounded-lg hover:bg-stone-800 lg:hidden shrink-0">
                <ChevronLeft className="h-4 w-4 text-stone-500" />
              </button>
            </>
          )}
        </div>

        {isCollapsed && (
          <button onClick={() => setIsCollapsed(false)}
            title="Extinde meniul"
            className="hidden lg:flex items-center justify-center h-8 mx-2 rounded-lg hover:bg-stone-800 transition-colors shrink-0">
            <ChevronLeft className="h-4 w-4 text-stone-500 rotate-180" />
          </button>
        )}

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