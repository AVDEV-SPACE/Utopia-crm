'use client';

import { useEffect, useState } from 'react';

type Props = {
  initialOwner: number;
  initialAssistant: number;
  initialClients: number;
  initialToday: number;
  initialWeek: number;
};

export default function OverviewStats({
  initialOwner,
  initialAssistant,
  initialClients,
  initialToday,
  initialWeek,
}: Props) {
  const [owner, setOwner] = useState(initialOwner);
  const [assistants, setAssistants] = useState(initialAssistant);
  const [clients, setClients] = useState(initialClients);
  const [today, setToday] = useState(initialToday);
  const [week, setWeek] = useState(initialWeek);

  useEffect(() => {
    const update = async () => {
      try {
        const response = await fetch('/api/overview');
        if (!response.ok) return;
        const data = await response.json();

        const users = data.users || [];
        const bookings = data.bookings || [];

        setOwner(users.filter((r: any) => r.role === 'owner').length);
        setAssistants(users.filter((r: any) => r.role === 'assistant' || r.role === 'user').length);
        setClients(bookings.length);

        const todayStr = new Date().toDateString();
        setToday(bookings.filter((r: any) => new Date(r.created_at).toDateString() === todayStr).length);

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        setWeek(bookings.filter((r: any) => new Date(r.created_at) >= weekAgo).length);
      } catch (error) {
        console.error('Error updating stats:', error);
      }
    };

    // Initial update
    update();

    // Poll for updates
    const interval = setInterval(update, 10000); // Every 10 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-gray-300 text-sm mt-4">
      {/* Poți afișa aici valorile live dacă vrei, dar de obicei cardurile din page.tsx sunt suficiente */}
      <p>Live: Owneri {owner} | Asistenți {assistants} | Clienți {clients}</p>
    </div>
  );
}