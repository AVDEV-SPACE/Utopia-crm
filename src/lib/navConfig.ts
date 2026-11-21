// src/lib/navConfig.ts
//
// Singura sursă a navigației: categorie → pagini. O folosesc sidebar-ul și
// căutarea globală din header („Caută pagini…”).
import {
  LayoutDashboard,
  Calendar,
  Mail,
  BookOpen,
  Target,
  Bot,
  Workflow,
  Share2,
  type LucideIcon,
} from 'lucide-react';

/** Cheile numărătorilor din /api/nav/badges. */
export type NavBadgeKey = 'leadsNew' | 'followupsAwaiting' | 'socialsAwaiting';
export type NavBadges = Partial<Record<NavBadgeKey, number>>;

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  /** Cuvinte-cheie suplimentare pentru căutarea din header. */
  keywords: string[];
  badgeKey?: NavBadgeKey;
  /** Datele paginii, citite în avans la hover pe item (vezi `preload`). */
  prefetch?: string[];
}

// URL-urile exacte pe care le cer paginile la prima încărcare. Aceleași șiruri
// sunt cheile din cache-ul de date, deci trebuie să coincidă cu cele din pagini.
export const PAGE_DATA = {
  overview: '/api/overview?activity=14d',
  overviewGA: '/api/analytics/pageviews?period=30d',
  leadGeneration: '/api/leads?excludeSource=sheet,engine,linkedin',
  bookings: '/api/bookings',
  pipeline: '/api/pipeline/manage?limit=50&offset=0&sort=date',
} as const;

export interface NavCategory {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_CONFIG: NavCategory[] = [
  {
    id: 'general',
    label: 'General',
    items: [
      { name: 'Overview', href: '/overview', icon: LayoutDashboard, keywords: ['overview', 'dashboard', 'acasa', 'home', 'ov'], prefetch: [PAGE_DATA.overview, PAGE_DATA.overviewGA] },
    ],
  },
  {
    id: 'sales',
    label: 'Leads & Vânzări',
    items: [
      { name: 'Lead Generation', href: '/lead-generation', icon: Target, keywords: ['leads', 'lead', 'generation', 'prospecti', 'scanare', 'lg'], prefetch: [PAGE_DATA.leadGeneration] },
      { name: 'Pipeline', href: '/pipeline', icon: Workflow, keywords: ['pipeline', 'leaduri', 'outreach', 'campanie', 'pi'], badgeKey: 'leadsNew', prefetch: [PAGE_DATA.pipeline] },
    ],
  },
  {
    id: 'outreach',
    label: 'Outreach',
    items: [
      { name: 'Emails', href: '/educational-templates', icon: BookOpen, keywords: ['emails', 'email', 'templates', 'sabloane', 'educational', 'te'] },
      { name: 'Chats', href: '/messaging', icon: Mail, keywords: ['chats', 'messaging', 'mesaje', 'chat', 'conversatii', 'me'] },
      { name: 'AI Follow-Up', href: '/dashboard/follow-ups-ai', icon: Bot, keywords: ['ai', 'follow-up', 'followup', 'whatsapp', 'agent'], badgeKey: 'followupsAwaiting' },
      { name: 'Socials', href: '/socials', icon: Share2, keywords: ['socials', 'facebook', 'instagram', 'postari', 'inbox'], badgeKey: 'socialsAwaiting' },
    ],
  },
  {
    id: 'clients',
    label: 'Clienți',
    items: [
      { name: 'Bookings', href: '/bookings', icon: Calendar, keywords: ['bookings', 'programari', 'rezervari', 'bo'], prefetch: [PAGE_DATA.bookings] },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_CONFIG.flatMap((c) => c.items);

/** Pagina e activă și pe subrutele ei (ex. /pipeline/123). */
export function isNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function categoryOf(pathname: string | null): string | null {
  return NAV_CONFIG.find((c) => c.items.some((i) => isNavActive(pathname, i.href)))?.id ?? null;
}
