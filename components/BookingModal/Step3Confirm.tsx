'use client';
import { useState } from 'react';
import { BookingFormData } from '@/types/booking';

interface Props {
  data: Partial<BookingFormData>;
  onBack: () => void;
  onSubmit: () => void;
  loading: boolean;
  error: string;
}

export default function Step3Confirm({ data, onBack, onSubmit, loading, error }: Props) {
  const [agreed, setAgreed] = useState(false);

  const rows = [
    ['Nume', data.full_name],
    ['Email', data.email],
    ['Telefon', data.phone || '—'],
    ['Cabinet', data.company_name || '—'],
    ['Data întâlnirii', data.meeting_date],
    ['Ora întâlnirii', data.meeting_time],
    ['Serviciu dorit', data.service_desired],
    ['Buget estimat', data.budget_range || '—'],
    ['Termen dorit', data.timeline || '—'],
  ];

  return (
    <div>
      <h4 style={{ marginBottom: '6px', fontFamily: 'var(--font-serif)', fontSize: '20px' }}>Verifică detaliile</h4>
      <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '14px' }}>
        Confirmare rezervare — verifică că totul este corect înainte de submit.
      </p>
      <div className="confirm-box">
        {rows.map(([label, value]) => (
          <div key={label} className="confirm-row">
            <strong>{label}</strong>
            <span>{value}</span>
          </div>
        ))}
      </div>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '20px', cursor: 'pointer', fontSize: '14px', color: 'var(--text-muted)' }}>
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
          style={{ marginTop: '3px', accentColor: 'var(--accent)', flexShrink: 0 }} />
        Sunt de acord cu <a href="#" style={{ color: 'var(--accent)', marginLeft: '4px' }}>Politica de confidențialitate</a>
      </label>
      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: '16px', color: '#DC2626', fontSize: '14px' }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: '12px' }}>
        <button className="btn btn-outline" onClick={onBack} style={{ flex: 1, justifyContent: 'center' }}>← Înapoi</button>
        <button className="btn btn-primary" onClick={onSubmit} disabled={!agreed || loading}
          style={{ flex: 2, justifyContent: 'center', opacity: !agreed || loading ? 0.6 : 1 }}>
          {loading ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
              Se trimite...
            </span>
          ) : 'Confirmă întâlnirea →'}
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
