'use client';
import { useState } from 'react';
import { BookingFormData } from '@/types/booking';

interface Props {
  data: Partial<BookingFormData>;
  onChange: (d: Partial<BookingFormData>) => void;
  onNext: () => void;
}

const timeSlots = ['09:00','09:30','10:00','10:30','11:00','11:30','14:00','14:30','15:00','15:30','16:00','16:30'];

export default function Step1Personal({ data, onChange, onNext }: Props) {
  const [errors, setErrors] = useState<Record<string,string>>({});

  const validate = () => {
    const e: Record<string,string> = {};
    if (!data.full_name?.trim()) e.full_name = 'Numele este obligatoriu';
    if (!data.email?.trim()) e.email = 'Emailul este obligatoriu';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '')) e.email = 'Email invalid';
    if (!data.meeting_date) e.meeting_date = 'Selectează o dată';
    if (!data.meeting_time) e.meeting_time = 'Selectează o oră';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px', fontSize: '15px' }}>
        Completează datele tale pentru a rezerva o întâlnire gratuită de consultanță.
      </p>
      <div className="form-group">
        <label className="form-label">Nume complet <span className="required">*</span></label>
        <input className="form-input" placeholder="ex: Dr. Maria Popescu" value={data.full_name || ''}
          onChange={e => onChange({ full_name: e.target.value })} />
        {errors.full_name && <p className="form-error">{errors.full_name}</p>}
      </div>
      <div className="form-group">
        <label className="form-label">Email <span className="required">*</span></label>
        <input className="form-input" type="email" placeholder="adresa@cabinet.ro" value={data.email || ''}
          onChange={e => onChange({ email: e.target.value })} />
        {errors.email && <p className="form-error">{errors.email}</p>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="form-group">
          <label className="form-label">Telefon</label>
          <input className="form-input" type="tel" placeholder="07xx xxx xxx" value={data.phone || ''}
            onChange={e => onChange({ phone: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Cabinet / Companie</label>
          <input className="form-input" placeholder="Numele cabinetului" value={data.company_name || ''}
            onChange={e => onChange({ company_name: e.target.value })} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="form-group">
          <label className="form-label">Data preferată <span className="required">*</span></label>
          <input className="form-input" type="date" min={today} value={data.meeting_date || ''}
            onChange={e => onChange({ meeting_date: e.target.value })} />
          {errors.meeting_date && <p className="form-error">{errors.meeting_date}</p>}
        </div>
        <div className="form-group">
          <label className="form-label">Ora preferată <span className="required">*</span></label>
          <select className="form-select" value={data.meeting_time || ''}
            onChange={e => onChange({ meeting_time: e.target.value })}>
            <option value="">Selectează ora</option>
            {timeSlots.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {errors.meeting_time && <p className="form-error">{errors.meeting_time}</p>}
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Subiect meeting</label>
        <select className="form-select" value={data.meeting_topic || ''}
          onChange={e => onChange({ meeting_topic: e.target.value })}>
          <option value="">Selectează subiectul</option>
          <option>Consultanță pachet ESSENTIAL</option>
          <option>Consultanță pachet INTERACTIVE</option>
          <option>Consultanță pachet ELITE</option>
          <option>Mentenanță lunară</option>
          <option>Întrebări generale</option>
        </select>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '24px' }}>
        * Vom confirma disponibilitatea și trimitem linkul Google Meet pe email.
      </p>
      <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
        onClick={() => { if (validate()) onNext(); }}>
        Continuă →
      </button>
    </div>
  );
}