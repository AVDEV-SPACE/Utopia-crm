import { PageSkeleton } from '@/components/ui/skeleton';

// Afișat de App Router cât se încarcă codul rutei noi (sidebar-ul și header-ul rămân).
export default function DashboardLoading() {
  return <PageSkeleton />;
}
