'use client';
import { BookingFormData } from '@/types/booking';

interface Props {
  data: Partial<BookingFormData>;
  onChange: (d: Partial<BookingFormData>) => void;
  preselected: string;
  onNext: () => void;
  onBack: () => void;
}

const services = [
  { id: 'essential', label: 'Website ESSENTIAL', subtitle: '450€' },
  { id: 'interactive', label: 'Website INTERACTIVE', subtitle: '680€' },
  { id: 'elite', label: 'Website ELITE + AI', subtitle: '900€' },
  { id: 'mentenanta', label: 'Mentenanță lunară', subtitle: 'De la 40€/lună' },
  { id: 'nehotarat', label: 'Nu știu încă', subtitle: 'Vreau să discut' },
];

const features = [
  'Formular de programări online',
  'Galerie foto/video a cabinetului',
  'Prezentare echipă medicală',
  'Pagini separate pe servicii',
  'Chat / Asistent AI',
  'Integrare Google Maps',
  'Testimoniale pacienți',
  'Blog / articole informative',
];

export default function Step2Project({ data, onChange, preselected, onNext, onBack }: Props) {
  const toggleFeature = (f: string) => {
    const current = data.desired_features || [];
    const updated = current.includes(f) ? current.filter(x => x !== f) : [...current, f];
    onChange({ desired_features: updated });
  };

  const currentService = data.service_desired || preselected;

  return (
    <div>
      <h4 style={{ marginBottom: '6px', fontFamily: 'var(--font-serif)', fontSize: '20px' }}>
        Spune-ne despre proiectul tău
      </h4>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '14px' }}>
        Aceste informații ne ajută să pregătim o consultanță personalizată și eficientă.
      </p>

      {/* 1. Serviciu dorit */}
      <div className="form-group">
        <label className="form-label">Ce serviciu te interesează? <span className="required">*</span></label>
        <div className="radio-cards">
          {services.map(s => (
            <div key={s.id} className="radio-card">
              <input type="radio" id={s.id} name="service" value={s.label}
                checked={currentService === s.label}
                onChange={() => onChange({ service_desired: s.label })} />
              <label htmlFor={s.id}>
                <strong style={{ display: 'block' }}>{s.label}</strong>
                <span style={{ fontSize: '12px', opacity: 0.7 }}>{s.subtitle}</span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Website existent */}
      <div className="form-group">
        <label className="form-label">Ai deja un website?</label>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '10px' }}>
          {['Da, am website', 'Nu, este primul meu site'].map(opt => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
              <input type="radio" name="has_website" value={opt}
                checked={data.existing_website === opt}
                onChange={() => onChange({ existing_website: opt })} />
              {opt}
            </label>
          ))}
        </div>
        {data.existing_website === 'Da, am website' && (
          <input className="form-input" placeholder="URL website existent (ex: https://cabinetul.ro)"
            value={data.website_url || ''} onChange={e => onChange({ website_url: e.target.value })} />
        )}
      </div>

      {/* 3. Scopul website-ului */}
      <div className="form-group">
        <label className="form-label">Care este scopul principal al website-ului? <span className="required">*</span></label>
        <textarea className="form-textarea" placeholder="ex: Vreau să atrag pacienți noi și să ofer posibilitatea de programare online..."
          value={data.website_purpose || ''} onChange={e => onChange({ website_purpose: e.target.value })} />
      </div>

      {/* 4. Public țintă */}
      <div className="form-group">
        <label className="form-label">Cine sunt pacienții tăi tipici?</label>
        <textarea className="form-textarea" style={{ minHeight: '72px' }}
          placeholder="ex: Adulți 25-55 ani din zona orașului care caută servicii stomatologice de calitate..."
          value={data.target_audience || ''} onChange={e => onChange({ target_audience: e.target.value })} />
      </div>

      {/* 5. Funcționalități dorite */}
      <div className="form-group">
        <label className="form-label">Ce funcționalități sunt importante pentru tine?</label>
        <div className="checkbox-group">
          {features.map(f => (
            <label key={f} className="checkbox-item">
              <input type="checkbox" checked={(data.desired_features || []).includes(f)}
                onChange={() => toggleFeature(f)} />
              {f}
            </label>
          ))}
        </div>
      </div>

      {/* 6. Referințe */}
      <div className="form-group">
        <label className="form-label">Site-uri sau cabinete pe care le admiri ca design?</label>
        <input className="form-input" placeholder="ex: https://exemplu.ro — îmi place că e simplu și modern"
          value={data.competitors_reference || ''} onChange={e => onChange({ competitors_reference: e.target.value })} />
      </div>

      {/* 7. Rezultat dorit */}
      <div className="form-group">
        <label className="form-label">Ce rezultat concret vrei în primele 3 luni după lansare?</label>
        <textarea className="form-textarea" style={{ minHeight: '72px' }}
          placeholder="ex: Vreau să primesc cel puțin 10 programări noi pe săptămână prin site..."
          value={data.desired_result || ''} onChange={e => onChange({ desired_result: e.target.value })} />
      </div>

      {/* 8 + 9. Buget & Termen */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="form-group">
          <label className="form-label">Buget estimat</label>
          <select className="form-select" value={data.budget_range || ''}
            onChange={e => onChange({ budget_range: e.target.value })}>
            <option value="">Selectează</option>
            <option>Sub 400€</option><option>400€ – 600€</option>
            <option>600€ – 1000€</option><option>Peste 1000€</option>
            <option>Nu am stabilit încă</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Termen dorit</label>
          <select className="form-select" value={data.timeline || ''}
            onChange={e => onChange({ timeline: e.target.value })}>
            <option value="">Selectează</option>
            <option>Cât mai curând (1–2 săptămâni)</option>
            <option>În 1 lună</option><option>În 2–3 luni</option>
            <option>Flexibil, calitatea contează</option>
          </select>
        </div>
      </div>

      {/* 10. Note */}
      <div className="form-group">
        <label className="form-label">Alte informații sau întrebări</label>
        <textarea className="form-textarea" style={{ minHeight: '72px' }} placeholder="Orice altceva vrei să ne spui..."
          value={data.additional_notes || ''} onChange={e => onChange({ additional_notes: e.target.value })} />
      </div>

      <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
        <button className="btn btn-outline" onClick={onBack} style={{ flex: 1, justifyContent: 'center' }}>← Înapoi</button>
        <button className="btn btn-primary" onClick={onNext} style={{ flex: 2, justifyContent: 'center' }}>Continuă →</button>
      </div>
    </div>
  );
}