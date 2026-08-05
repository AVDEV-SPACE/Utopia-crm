'use client';

import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface ServicePieChartProps {
  data: { service: string; count: number }[];
}

const CHART_COLORS = [
  '#eab308', '#84cc16', '#f97316', '#06b6d4', '#8b5cf6',
  '#ec4899', '#ef4444', '#10b981', '#3b82f6', '#f59e0b',
  '#6366f1', '#d946ef', '#14b8a6', '#f43f5e',
];

export function ServicePieChart({ data }: ServicePieChartProps) {
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
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const getThemeStyles = () => {
    switch (theme) {
      case 'light':
        return {
          text: '#1a1a1a',
          cardBg: '#ffffff',
          border: 'oklch(0.87 0.006 247)',
          mutedText: '#666666',
          rowHover: '#f5f5f5',
        };
      case 'amber':
        return {
          text: 'oklch(0.98 0.003 247)',
          cardBg: 'oklch(0.17 0.05 40)',
          border: 'oklch(1 0 0 / 10%)',
          mutedText: 'oklch(0.65 0.03 40)',
          rowHover: 'oklch(0.20 0.055 40)',
        };
      default:
        return {
          text: 'oklch(0.984 0.003 247.858)',
          cardBg: 'oklch(0.168 0.007 17)',
          border: 'oklch(1 0 0 / 10%)',
          mutedText: 'oklch(0.55 0.006 17)',
          rowHover: 'oklch(0.21 0.006 17)',
        };
    }
  };

  const s = getThemeStyles();
  const hasData = data && data.length > 0;
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const sortedData = [...data].sort((a, b) => b.count - a.count);

  // ✅ Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const { name, value } = payload[0];
    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
    return (
      <div style={{
        background: '#fff',
        border: 'none',
        borderRadius: 8,
        padding: '8px 14px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        color: '#111',
        fontSize: 13,
      }}>
        <p style={{ fontWeight: 600, marginBottom: 2 }}>{name}</p>
        <p>{value} programări · {pct}%</p>
      </div>
    );
  };

  // ✅ Custom legend — rând cu culoare + nume + procent, fără suprapuneri
  const CustomLegend = () => (
    <div style={{
      marginTop: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      maxHeight: 140,
      overflowY: 'auto',
      paddingRight: 4,
    }}>
      {sortedData.map((entry, index) => {
        const pct = total > 0 ? ((entry.count / total) * 100).toFixed(1) : '0';
        const color = CHART_COLORS[index % CHART_COLORS.length];
        return (
          <div
            key={entry.service}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 8px',
              borderRadius: 6,
              cursor: 'default',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = s.rowHover)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {/* ✅ Pătrat colorat */}
            <div style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: color,
              flexShrink: 0,
            }} />
            {/* Nume serviciu */}
            <span style={{
              fontSize: 12,
              color: s.text,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {entry.service}
            </span>
            {/* Count + procent */}
            <span style={{
              fontSize: 11,
              color: s.mutedText,
              flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {entry.count} · {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );

  return (
    <div
      className="rounded-2xl p-5 transition-colors h-96 flex flex-col"
      style={{
        backgroundColor: s.cardBg,
        border: `1px solid ${s.border}`,
      }}
    >
      <h3 style={{
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        color: s.mutedText,
        marginBottom: 12,
      }}>
        Distribuție servicii
      </h3>

      {hasData ? (
        <div className="flex-1 flex flex-col">
          {/* ✅ Pie fără label — doar pie + tooltip */}
          <div style={{ width: '100%', height: 160 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sortedData}
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  innerRadius={40}
                  dataKey="count"
                  nameKey="service"
                  paddingAngle={2}
                  // ✅ Niciun label pe pie — evită suprapunerile
                  label={false}
                  labelLine={false}
                >
                  {sortedData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={CHART_COLORS[index % CHART_COLORS.length]}
                      stroke="transparent"
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* ✅ Legendă custom — listă curată fără suprapuneri */}
          <CustomLegend />

        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center" style={{
          color: s.mutedText,
          fontSize: 13,
        }}>
          Nu există servicii înregistrate
        </div>
      )}
    </div>
  );
}