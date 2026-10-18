// src/app/(dashboard)/bookings/page.tsx
'use client';
import { useState, useMemo, useEffect } from 'react';

export const dynamic = 'force-dynamic';

interface Booking {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  service: string | null;
  meeting_date: string;
  meeting_time: string;
  status: string;
  created_at: string;
}

const ITEMS_PER_PAGE = 10;

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterService, setFilterService] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const fetchBookings = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/bookings');
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        setBookings(data || []);
      } catch (error) {
        console.error('Error fetching bookings:', error);
        setBookings([]);
      } finally {
        setLoading(false);
      }
    };

    fetchBookings();
  }, []);

  // Get unique services for filter dropdown
  const services = useMemo(() => {
    const uniqueServices = new Set<string>();
    bookings.forEach(booking => {
      if (booking.service?.trim()) {
        uniqueServices.add(booking.service.trim());
      }
    });
    return ['all', ...Array.from(uniqueServices)];
  }, [bookings]);

  // Filter and search logic
  const filteredBookings = useMemo(() => {
    let filtered = bookings;

    // Filter by service
    if (filterService !== 'all') {
      filtered = filtered.filter(b => b.service?.trim() === filterService);
    }

    // Search
    if (search) {
      const lowerSearch = search.toLowerCase();
      filtered = filtered.filter(b =>
        b.name?.toLowerCase().includes(lowerSearch) ||
        b.email?.toLowerCase().includes(lowerSearch) ||
        b.phone?.includes(lowerSearch) ||
        b.service?.toLowerCase().includes(lowerSearch)
      );
    }

    return filtered;
  }, [bookings, filterService, search]);

  // Sort by creation date (newest first)
  const sortedBookings = useMemo(() => {
    return [...filteredBookings].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [filteredBookings]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedBookings.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedBookings = sortedBookings.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleFilterChange = (newService: string) => {
    setFilterService(newService);
    setCurrentPage(1);
  };

  const handleSearchChange = (newSearch: string) => {
    setSearch(newSearch);
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-stone-500">
          <div className="w-5 h-5 border-2 border-stone-700 border-t-amber-500 rounded-full animate-spin" />
          <span>Se încarcă rezervările...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Bookings</h1>
        <p className="text-gray-400">{sortedBookings.length} total</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <input
          type="text"
          placeholder="Caută după nume, email, telefon..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="flex-1 px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-orange-500 outline-none transition"
        />

        <select
          value={filterService}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="px-4 py-3 pr-10 bg-neutral-800 border border-neutral-700 rounded-xl text-white focus:ring-2 focus:ring-orange-500 outline-none transition appearance-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%23fb923c' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
            backgroundPosition: 'right 10px center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '16px',
          }}
        >
          {services.map((service) => (
            <option key={service} value={service}>
              {service === 'all' ? 'Toate serviciile' : service}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/95 backdrop-blur-sm">
        <table className="w-full">
          <thead className="bg-neutral-800/80 border-b border-neutral-700">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-orange-400 uppercase tracking-wider">ID</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-orange-400 uppercase tracking-wider">Nume</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-orange-400 uppercase tracking-wider">Email</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-orange-400 uppercase tracking-wider">Telefon</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-orange-400 uppercase tracking-wider">Serviciu</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-orange-400 uppercase tracking-wider">Data</th>
              <th className="px-6 py-4 text-left text-xs font-bold text-orange-400 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {paginatedBookings.map((booking) => (
              <tr key={booking.id} className="hover:bg-neutral-800/40 transition">
                <td className="px-6 py-4 text-sm text-gray-300 font-medium">
                  {booking.id.slice(0, 8)}...
                </td>
                <td className="px-6 py-4 text-sm font-medium text-white">
                  {booking.name}
                </td>
                <td className="px-6 py-4 text-sm text-gray-300 truncate">
                  {booking.email}
                </td>
                <td className="px-6 py-4 text-sm text-gray-300 font-mono">
                  {booking.phone || '—'}
                </td>
                <td className="px-6 py-4">
                  <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/40">
                    {booking.service || '—'}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-300">
                  {new Date(booking.meeting_date).toLocaleDateString('ro-RO')} {booking.meeting_time}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${
                    booking.status === 'pending'
                      ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40'
                      : 'bg-green-500/20 text-green-400 border border-green-500/40'
                  }`}>
                    {booking.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-8">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white disabled:opacity-50 hover:bg-neutral-700 transition"
          >
            ← Anterior
          </button>

          <div className="flex gap-1">
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
            className="px-4 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white disabled:opacity-50 hover:bg-neutral-700 transition"
          >
            Următor →
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-xs sm:text-sm text-gray-400 bg-neutral-800/40 rounded-xl p-4">
        <p>
          Se afișează <span className="text-orange-400 font-bold">{paginatedBookings.length}</span> din{' '}
          <span className="text-white font-bold">{sortedBookings.length}</span> rezervări
          {filterService !== 'all' && ` cu "${filterService}"`}
        </p>
      </div>
    </div>
  );
}