'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Save, Video, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

export interface BookingRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company_name?: string | null;
  service: string | null;
  message?: string | null;
  meet_link?: string | null;
  meeting_date: string;
  meeting_time: string;
  status: string;
  created_at: string;
}

export const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: 'În așteptare',
  confirmed: 'Confirmată',
  completed: 'Finalizată',
  cancelled: 'Anulată',
};

const fieldClass =
  'w-full rounded-md border border-[var(--card-border)] bg-[var(--surface-1)] px-3 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40';

/**
 * Coloanele `date` vin serializate ca instant ISO UTC (`2026-11-19T22:00:00.000Z`
 * = miezul nopții local), deci ziua se citește în ora locală, nu din primele 10 caractere.
 */
export function toDateInput(value: string): string {
  if (!value.includes('T')) return value.slice(0, 10);
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const toTimeInput = (value: string) => value.slice(0, 5);

interface FormState {
  name: string;
  email: string;
  company: string;
  service: string;
  meeting_date: string;
  meeting_time: string;
  status: string;
  message: string;
}

function toForm(b: BookingRow): FormState {
  return {
    name: b.name ?? '',
    email: b.email ?? '',
    company: b.company_name ?? '',
    service: b.service ?? '',
    meeting_date: toDateInput(b.meeting_date),
    meeting_time: toTimeInput(b.meeting_time),
    status: b.status,
    message: b.message ?? '',
  };
}

/** Fișa unei programări (panou lateral, ca în /pipeline): toate câmpurile se pot edita. */
export function BookingDetailSheet({
  booking,
  services,
  onClose,
  onUpdated,
}: {
  booking: BookingRow | null;
  services: string[];
  onClose: () => void;
  onUpdated: (booking: BookingRow) => void;
}) {
  const [form, setForm] = useState<FormState | null>(booking ? toForm(booking) : null);
  const [saving, setSaving] = useState(false);

  // Formularul se reinițializează doar la deschiderea altei programări: live
  // refresh-ul paginii (la 15s) înlocuiește obiectul și ar șterge editarea în curs.
  const bookingId = booking?.id ?? null;
  useEffect(() => {
    setForm(booking ? toForm(booking) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const set = (key: keyof FormState) => (value: string) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const dirty = !!booking && !!form && JSON.stringify(form) !== JSON.stringify(toForm(booking));

  async function handleSave() {
    if (!booking || !form) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          company: form.company.trim() || null,
          service: form.service.trim() || null,
          message: form.message.trim() || null,
          meeting_date: form.meeting_date,
          meeting_time: form.meeting_time,
          status: form.status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut salva programarea');
      // Telefonul nu e în tabela bookings: îl păstrăm din rândul existent
      const saved: BookingRow = { ...booking, ...data, phone: booking.phone };
      onUpdated(saved);
      setForm(toForm(saved));
      toast.success('Programarea a fost actualizată.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut salva programarea');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={!!booking} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl bg-stone-900 border-stone-800/60 text-stone-100 overflow-y-auto gap-0">
        {booking && form && (
          <>
            <SheetHeader className="border-b border-stone-800/60 pr-12">
              <SheetTitle className="text-stone-100 truncate">{booking.name}</SheetTitle>
              <SheetDescription className="text-stone-500">
                {[booking.service, `${new Date(booking.meeting_date).toLocaleDateString('ro-RO')} ${toTimeInput(booking.meeting_time)}`]
                  .filter(Boolean)
                  .join(' · ')}
              </SheetDescription>
            </SheetHeader>

            <div className="p-4 space-y-4">
              {(booking.meet_link || booking.phone) && (
                <div className="flex flex-wrap gap-2">
                  {booking.meet_link && (
                    <Button asChild size="sm" variant="accent">
                      <a href={booking.meet_link} target="_blank" rel="noopener noreferrer">
                        <Video /> Deschide întâlnirea
                      </a>
                    </Button>
                  )}
                  {booking.phone && (
                    <Button asChild size="sm" variant="outline">
                      <a href={`tel:${booking.phone}`}>
                        <Phone /> {booking.phone}
                      </a>
                    </Button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Nume">
                  <Input value={form.name} onChange={(e) => set('name')(e.target.value)} />
                </Field>
                <Field label="Email">
                  <Input type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} />
                </Field>
                <Field label="Firmă">
                  <Input value={form.company} onChange={(e) => set('company')(e.target.value)} placeholder="—" />
                </Field>
                <Field label="Serviciu">
                  <Input
                    list="booking-services"
                    value={form.service}
                    onChange={(e) => set('service')(e.target.value)}
                    placeholder="—"
                  />
                  <datalist id="booking-services">
                    {services.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Data">
                  <Input type="date" value={form.meeting_date} onChange={(e) => set('meeting_date')(e.target.value)} />
                </Field>
                <Field label="Ora">
                  <Input type="time" value={form.meeting_time} onChange={(e) => set('meeting_time')(e.target.value)} />
                </Field>
                <Field label="Status">
                  <select value={form.status} onChange={(e) => set('status')(e.target.value)} className={`${fieldClass} h-9`}>
                    {Object.entries(BOOKING_STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Mesaj">
                <textarea
                  value={form.message}
                  onChange={(e) => set('message')(e.target.value)}
                  rows={4}
                  placeholder="Mesajul lăsat la programare"
                  className={`${fieldClass} py-2`}
                />
              </Field>

              <div className="flex items-center justify-between gap-3 pt-1">
                <p className="text-xs text-stone-600">
                  Creată: {new Date(booking.created_at).toLocaleDateString('ro-RO')}
                  {booking.meet_link && ' · schimbarea datei nu mută invitația din calendar'}
                </p>
                <Button disabled={saving || !dirty} onClick={handleSave}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}
                  Salvează
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs text-stone-500 mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}
