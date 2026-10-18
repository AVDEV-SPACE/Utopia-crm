// components/charts/CumulativeBarChart.tsx
'use client';

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';

interface CumulativeBarChartProps {
  data: { date: string; count: number }[];
  title?: string;
}

// Paletă de culori pentru bare
const CHART_COLORS = [
  '#eab308', '#84cc16', '#f97316', '#06b6d4', '#8b5cf6',
  '#ec4899', '#ef4444', '#10b981', '#3b82f6', '#f59e0b',
  '#6366f1', '#d946ef', '#14b8a6', '#f43f5e',
];

export function CumulativeBarChart({ data, title = "Programări zilnice" }: CumulativeBarChartProps) {
  const [theme, setTheme] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') ?? 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const newTheme = document.documentElement.getAttribute('data-theme') ?? 'dark';
      setTheme(newTheme);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    return () => observer.disconnect();
  }, []);

  // Culori bazate pe tema aplicației folosind valorile din globals.css
  const getThemeStyles = () => {
    switch (theme) {
      case 'light':
        return {
          background: 'oklch(79.749% 0.03063 257.821)',
          text: '#070d18',
          cardBg: '#ffffff',
          border: 'rgb(28 59 102 / 0.22)',
        };
      case 'dark':
      default:
        return {
          background: '#070d18',
          text: '#eef5ff',
          cardBg: '#0c1a2e',
          border: 'rgb(143 184 230 / 0.14)',
        };
    }
  };

  const themeStyles = getThemeStyles();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  };

  const hasData = data && data.length > 0;
  const maxCount = Math.max(...data.map(d => d.count), 0);
  const totalBookings = data.reduce((sum, item) => sum + item.count, 0);
  const daysWithBookings = data.filter(d => d.count > 0).length;

  // Pentru a evita aglomerarea, afișăm un subset de tick-uri
  const getTickInterval = () => {
    if (data.length <= 10) return 0;
    if (data.length <= 20) return 1;
    return Math.floor(data.length / 10);
  };

  return (
    <div
      className="rounded-2xl p-3 hover:border-amber-500/20 transition-colors h-96 flex flex-col"
      style={{
        backgroundColor: themeStyles.cardBg,
        border: `1px solid ${themeStyles.border}`
      }}
    >
      <h3 className="text-sm uppercase tracking-wider ml-3" style={{ color: themeStyles.text, opacity: 0.6 }}>
        {title}
      </h3>
      <div className="text-xs text-left ml-3" style={{ color: themeStyles.text, opacity: 0.5 }}>
        Total programări: {totalBookings} | Zile cu programări: {daysWithBookings}
      </div>
      <div className="flex-1 w-full">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={data} 
              margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
            >
              <XAxis
                dataKey="date"
                tickFormatter={formatDate}
                axisLine={false}
                tickLine={false}
                tick={{ fill: themeStyles.text, fontSize: 10 }}
                interval={getTickInterval()}
                angle={0}
                dy={5}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: themeStyles.text, fontSize: 12 }}
                allowDecimals={false}
                domain={[0, Math.max(maxCount, 1)]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  color: 'black',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                }}
                labelFormatter={(value) => {
                  const date = new Date(value as string);
                  return `Data: ${date.toLocaleDateString('ro-RO')}`;
                }}
                formatter={(value) => [`${value} programări`, 'Total']}
                cursor={{ fill: 'transparent' }}
              />
              <Bar 
                dataKey="count" 
                radius={[4, 4, 0, 0]}
                cursor="pointer"
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                    stroke={themeStyles.cardBg}
                    strokeWidth={1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full" style={{ color: themeStyles.text, opacity: 0.5 }}>
            Nu există programări în perioada selectată
          </div>
        )}
      </div>
    </div>
  );
}