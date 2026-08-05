'use client';

import { useState, useMemo, useEffect } from 'react';

interface RawRecord {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  service: string | null;
  created_at?: string;
}

interface ClientDisplay {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  latestService: string;
  allServices: Set<string>;
}

const ITEMS_PER_PAGE = 8;

export function DataTableClients({ data: initialData = [] }: { data?: RawRecord[] }) {
  const [data, setData] = useState<RawRecord[]>(initialData);
  const [loading, setLoading] = useState(initialData.length === 0);
  const [search, setSearch] = useState('');
  const [filterService, setFilterService] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (initialData.length > 0) {
      setData(initialData);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/bookings');
        if (!response.ok) throw new Error('Failed to fetch');
        const fetchedData = await response.json();
        console.log('Clients fetched:', fetchedData?.length);
        setData(fetchedData || []);
      } catch (error) {
        console.error('Error fetching clients:', error);
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  //* --- Construim lista de clienți unici
  const clientsMap = useMemo(() => {
    const map = new Map<string, ClientDisplay>();

    data.forEach((record) => {
      const service = record.service?.trim() || 'Necunoscut';

      // Cheie unică pentru client (după email, telefon sau nume)
      const key = (record.email?.trim().toLowerCase() ||
                    record.phone?.trim() ||
                    record.name?.trim().toLowerCase() ||
                    record.id).toLowerCase();

      const existing = map.get(key);

      if (!existing) {
        // Primeiro client cu cheia asta
        map.set(key, {
          id: record.id,
          name: record.name || null,
          email: record.email || null,
          phone: record.phone || null,
          latestService: service,
          allServices: new Set([service]),
        });
      } else {
        // Client exista deja, adauga serviciul la set
        existing.allServices.add(service);
        // Actualizeaza datele daca sunt mai complete
        if (!existing.name && record.name) existing.name = record.name;
        if (!existing.email && record.email) existing.email = record.email;
        if (!existing.phone && record.phone) existing.phone = record.phone;
      }
    });

    return map;
  }, [data]);

  //* --- Lista de servicii pentru dropdown
  const services = useMemo(() => {
    const uniqueServices = new Set<string>();
    data.forEach(record => {
      if (record.service?.trim()) {
        uniqueServices.add(record.service.trim());
      }
    });
    return ['all', ...Array.from(uniqueServices)];
  }, [data]);

  //* --- Logica de filtrare și afișare
  const displayed = useMemo(() => {
    if (filterService === 'all') {
      // Mode: Afișează clienți unici (deduplicate)
      return Array.from(clientsMap.values());
    } else {
      // Mode: Afișează FIECARE rând din DB cu serviciul selectat
      return data.filter(r => r.service?.trim() === filterService);
    }
  }, [clientsMap, data, filterService]);

  //* --- Căutare
  const filtered = useMemo(() => {
    if (!search) return displayed;

    const lowerSearch = search.toLowerCase();
    return displayed.filter(item => {
      const name = 'name' in item ? item.name : null;
      const email = 'email' in item ? item.email : null;
      const phone = 'phone' in item ? item.phone : null;

      return (
        name?.toLowerCase().includes(lowerSearch) ||
        email?.toLowerCase().includes(lowerSearch) ||
        phone?.includes(lowerSearch)
      );
    });
  }, [displayed, search]);

  //* --- Sortare
  const sorted = useMemo(() => {
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      // Sort by ID for now
      return b.id.localeCompare(a.id);
    });
    return sorted;
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedData = sorted.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleFilterChange = (newService: string) => {
    setFilterService(newService);
    setCurrentPage(1);
  };

  const handleSearchChange = (newSearch: string) => {
    setSearch(newSearch);
    setCurrentPage(1);
  };

  const isClientDisplay = (item: any): item is ClientDisplay => 'allServices' in item;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-stone-500">
          <div className="w-5 h-5 border-2 border-stone-700 border-t-amber-500 rounded-full animate-spin" />
          <span>Se încarcă clienții...</span>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-stone-500 text-center">
          <p className="text-lg mb-2">Nu există clienți încă</p>
          <p className="text-sm">Adaugă primul client din header.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtre */}
      <div className="flex flex-col sm:flex-row gap-4">
        <input
          type="text"
          placeholder="Caută client (nume, email, telefon)..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="flex-1 px-4 py-3 radious bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-orange-500 outline-none transition text-sm sm:text-base"
        />

        <select
          value={filterService}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="px-4 py-3 pr-10 radious bg-neutral-800 border border-neutral-700 rounded-xl text-white focus:ring-2 focus:ring-orange-500 outline-none transition appearance-none text-sm sm:text-base"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%23fb923c' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
            backgroundPosition: 'right 10px center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '16px',
          }}
        >
          {services.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'Toate serviciile' : s}
            </option>
          ))}
        </select>
      </div>

      {/* Tabel Desktop */}
      <div className="hidden md:block overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/95 backdrop-blur-sm">
        <table className="w-full">
          <thead className="bg-neutral-800/80 border-b border-neutral-700">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-orange-400 uppercase tracking-wider">ID</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-orange-400 uppercase tracking-wider">Nume</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-orange-400 uppercase tracking-wider">Email</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-orange-400 uppercase tracking-wider">Telefon</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-orange-400 uppercase tracking-wider">
                {filterService === 'all' ? 'Ultimul serviciu' : 'Serviciu'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {paginatedData.map((record, idx) => (
              <tr key={`${record.id}-${idx}`} className="hover:bg-neutral-800/40 transition">
                <td className="px-6 py-4 text-sm text-gray-300 font-medium">{record.id.slice(0, 8)}...</td>
                <td className="px-6 py-4 text-sm font-medium text-white">{record.name || '—'}</td>
                <td className="px-6 py-4 text-sm text-gray-300 truncate">{record.email || '—'}</td>
                <td className="px-6 py-4 text-sm text-gray-300 font-mono">{record.phone || '—'}</td>
                <td className="px-6 py-4">
                  <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/40 min-w-max">
                    {isClientDisplay(record) ? record.latestService : record.service || '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="md:hidden space-y-3">
        {paginatedData.map((record, idx) => (
          <div key={`${record.id}-${idx}`} className="bg-neutral-800/50 rounded-xl p-4 border border-neutral-700">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-semibold text-white text-sm">{record.name || 'Fără nume'}</h3>
                <p className="text-xs text-gray-500">#{record.id.slice(0, 8)}...</p>
              </div>
              <span className="text-xs px-2 py-1 bg-orange-500/20 text-orange-400 rounded-full border border-orange-500/40 whitespace-nowrap">
                {isClientDisplay(record) ? record.latestService : record.service || '—'}
              </span>
            </div>
            <div className="space-y-1 text-xs text-gray-300">
              <p>✉️ {record.email || '—'}</p>
              <p>📞 {record.phone || '—'}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {(!data || data.length === 0) && (
        <div className="text-center py-12">
          <p className="text-gray-400 text-base">Nu sunt clienți în baza de date.</p>
        </div>
      )}

      {filtered.length === 0 && data.length > 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400 text-base">
            Nu am găsit niciun client cu aceste criterii.
          </p>
        </div>
      )}

      {/* Paginare */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-8 flex-wrap">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white disabled:opacity-50 hover:bg-neutral-700 transition text-sm"
          >
            ← Anterior
          </button>

          <div className="flex gap-1 flex-wrap justify-center">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`px-3 py-2 rounded-lg text-sm transition ${
                  currentPage === page 
                    ? 'bg-orange-500 text-white font-bold' 
                    : 'bg-neutral-800 text-gray-400 hover:bg-neutral-700'
                }`}
              >
                {page}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white disabled:opacity-50 hover:bg-neutral-700 transition text-sm"
          >
            Următor →
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-xs sm:text-sm text-gray-400 bg-neutral-800/40 rounded-xl p-4">
        <p>
          Se afișează <span className="text-orange-400 font-bold">{paginatedData.length}</span> din{' '}
          <span className="text-white font-bold">{sorted.length}</span> {filterService === 'all' ? 'clienți' : 'înregistrări'}
          {filterService !== 'all' && ` cu "${filterService}"`}
        </p>
      </div>
    </div>
  );
}

export default DataTableClients;