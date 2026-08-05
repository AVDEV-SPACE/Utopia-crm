// components/charts/DailyBarChart.tsx
'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface DailyBarChartProps {
  data: { date: string; count: number }[];
}

export function DailyBarChart({ data }: DailyBarChartProps) {
  // Inițializare directă, fără mounted state
  const [theme, setTheme] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('kspot-theme') || 'dark';
    }
    return 'dark';
  });

  // Folosim useEffect doar pentru event listener
  useEffect(() => {
    const handleThemeChange = () => {
      const newTheme = localStorage.getItem('kspot-theme') || 'dark';
      setTheme(newTheme);
    };

    window.addEventListener('storage', handleThemeChange);
    
    return () => {
      window.removeEventListener('storage', handleThemeChange);
    };
  }, []);

  const getColors = () => {
    switch (theme) {
      case 'light':
        return {
          bar: '#eab308',
          background: '#ffffff',
          text: '#1f2937',
        };
      case 'amber':
        return {
          bar: '#fbbf24',
          background: '#1c1917',
          text: '#fef3c7',
        };
      case 'dark':
      default:
        return {
          bar: '#a1a1aa',
          background: '#18181b',
          text: '#d4d4d8',
        };
    }
  };

  const colors = getColors();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ro-RO', { weekday: 'short' });
  };

  const hasData = data && data.length > 0 && data.some(item => item.count > 0);

  return (
    <div className="bg-stone-900/50 border border-stone-700/40 rounded-2xl p-5 hover:border-amber-500/20 transition-colors h-80">
      <h3 className="text-sm text-stone-400 uppercase tracking-wider mb-4">Programări zilnice (ultimele 7 zile)</h3>
      <div className="w-full h-64">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                axisLine={false}
                tickLine={false}
                tick={{ fill: colors.text, fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: colors.text, fontSize: 12 }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: colors.background,
                  border: `1px solid ${colors.bar}`,
                  borderRadius: '8px',
                  color: colors.text,
                }}
                labelFormatter={(value) => `Zi: ${formatDate(value as string)}`}
                formatter={(value) => [`${value} programări`, 'Total']}
              />
              <Bar dataKey="count" fill={colors.bar} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-stone-500">
            Nu există programări în ultimele 7 zile
          </div>
        )}
      </div>
    </div>
  );
}