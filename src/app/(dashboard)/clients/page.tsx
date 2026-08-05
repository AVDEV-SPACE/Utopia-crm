// src/app/(dashboard)/clients/page.tsx
'use client';
import DataTableClients from '../DataTableClients';

export default function ClientsPage() {
  return (
    <div className="min-h-screen">
      <DataTableClients />
    </div>
  );
}