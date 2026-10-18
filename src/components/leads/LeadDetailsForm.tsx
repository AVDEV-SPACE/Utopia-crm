'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Lead, LeadStatus, PitchChannel } from '@/services/leads/types';

const STATUS_OPTIONS: LeadStatus[] = [
  'new', 'scored', 'pitch_ready', 'sent', 'replied', 'negotiating', 'won', 'lost',
];

const CHANNEL_OPTIONS: PitchChannel[] = ['email', 'instagram', 'whatsapp'];

interface LeadDetailsFormProps {
  lead: Lead;
  onUpdated: (lead: Lead) => void;
}

export function LeadDetailsForm({ lead, onUpdated }: LeadDetailsFormProps) {
  const [form, setForm] = useState({
    company_name: lead.company_name ?? '',
    website: lead.website ?? '',
    niche: lead.niche ?? '',
    location: lead.location ?? '',
    contact_email: lead.contact_email ?? '',
    contact_phone: lead.contact_phone ?? '',
    contact_instagram: lead.contact_instagram ?? '',
    status: lead.status,
    pitch_channel: lead.pitch_channel,
    notes: lead.notes ?? '',
    category: lead.category ?? '',
    address: lead.address ?? '',
    opening_hours: lead.opening_hours ?? '',
  });
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSave() {
    if (!form.company_name.trim()) {
      toast.error('Numele firmei este obligatoriu.');
      return;
    }
    setSaving(true);
    try {
      // Câmpurile golite se trimit ca `''`; serverul le transformă în NULL
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Eroare la salvare');
      onUpdated(data as Lead);
      toast.success('Detalii actualizate.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eroare la salvare');
    } finally {
      setSaving(false);
    }
  }

  const field = (
    key: keyof typeof form,
    label: string,
    placeholder?: string,
    type = 'text'
  ) => (
    <div>
      <Label className="text-xs text-stone-500 mb-1.5 block">{label}</Label>
      <Input
        type={type}
        value={form[key] as string}
        placeholder={placeholder}
        onChange={(e) => set(key)(e.target.value)}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {field('company_name', 'Nume firmă *', 'Ex. Dental Clinic SRL')}
        {field('website', 'Website', 'https://exemplu.ro')}
        {field('niche', 'Nișă', 'Ex. dentist')}
        {field('location', 'Locație', 'Ex. Cluj-Napoca')}
        {field('contact_email', 'Email', 'contact@exemplu.ro', 'email')}
        {field('contact_phone', 'Telefon', '07xxxxxxxx')}
        {field('contact_instagram', 'Instagram', '@profil')}
        {field('category', 'Categorie', 'Ex. 1st Page')}
        {field('address', 'Adresă', 'Strada, număr')}
        {field('opening_hours', 'Program', 'L-V 09:00-18:00')}

        <div>
          <Label className="text-xs text-stone-500 mb-1.5 block">Status</Label>
          <select
            value={form.status}
            onChange={(e) => set('status')(e.target.value)}
            className="w-full h-9 rounded-md border border-stone-800 bg-stone-950/60 px-3 text-sm text-stone-200"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <Label className="text-xs text-stone-500 mb-1.5 block">Canal pitch</Label>
          <select
            value={form.pitch_channel}
            onChange={(e) => set('pitch_channel')(e.target.value)}
            className="w-full h-9 rounded-md border border-stone-800 bg-stone-950/60 px-3 text-sm text-stone-200"
          >
            {CHANNEL_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <Label className="text-xs text-stone-500 mb-1.5 block">
          Observații generale
          <span className="text-stone-600"> — rezumat permanent; cronologia discuțiilor stă în „Istoric"</span>
        </Label>
        <textarea
          value={form.notes}
          onChange={(e) => set('notes')(e.target.value)}
          rows={3}
          placeholder="Context care rămâne valabil: buget, decident, particularități..."
          className="w-full rounded-lg border border-stone-800 bg-stone-950/60 p-3 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-stone-600">
          Scor: {lead.score ?? '—'}
          {lead.rating !== null && (
            <> · Rating Google: ★ {Number(lead.rating).toFixed(1)}
              {lead.reviews_count !== null && ` (${lead.reviews_count})`}</>
          )}
          {' · '}Creat: {new Date(lead.created_at).toLocaleDateString('ro-RO')}
        </p>
        <Button disabled={saving} onClick={handleSave}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Salvează detaliile
        </Button>
      </div>
    </div>
  );
}
