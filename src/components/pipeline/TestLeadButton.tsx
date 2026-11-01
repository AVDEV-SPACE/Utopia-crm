'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FlaskConical, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TestLead {
  id: string;
  company_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  contact_instagram: string | null;
  pipeline_stage: string | null;
}

interface TestLeadButtonProps {
  /** Deschide lead-ul de test în fișa paginii. */
  onOpen: (leadId: string) => void;
  /** Lista paginii se reîncarcă după creare / resetare / ștergere. */
  onChanged: () => void;
}

/**
 * „Lead de test (eu)”: un lead din pipeline cu datele tale, ca să testezi
 * trimiterea pe fiecare canal, primirea mesajelor și schimbarea etapei.
 */
export function TestLeadButton({ onOpen, onChanged }: TestLeadButtonProps) {
  const [open, setOpen] = useState(false);
  const [lead, setLead] = useState<TestLead | null>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [instagram, setInstagram] = useState('');
  const [automationReaches, setAutomationReaches] = useState(true);
  const [busy, setBusy] = useState<'load' | 'save' | 'delete' | 'sync' | null>(null);

  useEffect(() => {
    if (!open) return;
    setBusy('load');
    fetch('/api/pipeline/manage/test-lead')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Nu am putut încărca lead-ul de test');
        const current = data.lead as TestLead | null;
        setLead(current);
        setEmail(current?.contact_email ?? data.accountEmail ?? '');
        setPhone(current?.contact_phone ?? '');
        setInstagram(current?.contact_instagram ?? '');
        setAutomationReaches(Boolean(data.automationReaches));
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Nu am putut încărca lead-ul de test'))
      .finally(() => setBusy(null));
  }, [open]);

  async function save() {
    setBusy('save');
    try {
      const res = await fetch('/api/pipeline/manage/test-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone, instagram }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut salva lead-ul de test');
      const saved = data.lead as TestLead;
      toast.success(lead ? 'Lead de test resetat: etapa „În coadă email”, pașii automați șterși' : 'Lead de test creat');
      setLead(saved);
      setAutomationReaches(Boolean(data.automationReaches));
      onChanged();
      setOpen(false);
      onOpen(saved.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut salva lead-ul de test');
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm('Ștergi lead-ul de test, cu istoricul și pașii lui automați?')) return;
    setBusy('delete');
    try {
      const res = await fetch('/api/pipeline/manage/test-lead', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Nu am putut șterge lead-ul de test');
      toast.success('Lead de test șters');
      setLead(null);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Nu am putut șterge lead-ul de test');
    } finally {
      setBusy(null);
    }
  }

  async function syncReplies() {
    setBusy('sync');
    try {
      const res = await fetch('/api/outreach/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Verificarea a eșuat');
      toast.success(
        data.processed > 0
          ? `${data.processed} răspunsuri procesate — etapele au fost actualizate`
          : `Niciun răspuns nou (${data.checked} emailuri verificate)`
      );
      if (data.processed > 0) onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verificarea a eșuat');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} title="Un lead cu datele tale, ca să testezi trimiterea și răspunsurile">
        <FlaskConical />
        Lead de test (eu)
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Lead de test" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl border border-stone-800 bg-stone-900 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center">
              <h3 className="text-sm font-semibold text-stone-100">Lead de test (eu)</h3>
              <button type="button" onClick={() => setOpen(false)} className="ml-auto text-stone-500 hover:text-stone-200" aria-label="Închide">
                <X size={16} />
              </button>
            </div>

            <p className="text-xs leading-relaxed text-stone-400">
              Un lead din pipeline cu datele tale. Deschide-l, trimite-ți un mesaj pe orice canal, răspunde la email și apasă
              „Verifică răspunsurile” — etapa trece în „Răspuns” sau „Interesat”, după ce scrii.
              {lead && ' Resetarea îl readuce în „În coadă email” și șterge pașii automați; istoricul rămâne.'}
            </p>

            {busy === 'load' ? (
              <div className="flex items-center gap-2 py-6 text-sm text-stone-500">
                <Loader2 size={14} className="animate-spin" /> Se încarcă...
              </div>
            ) : (
              <div className="space-y-3">
                <Field label="Email (primești emailurile aici)">
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputClass} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Telefon (SMS, WhatsApp)">
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07xx xxx xxx" className={inputClass} />
                  </Field>
                  <Field label="Instagram (opțional)">
                    <input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@contul.tau" className={inputClass} />
                  </Field>
                </div>
                {!automationReaches && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                    Secvența automată e în mod test și nu trimite la această adresă (nu e în OUTREACH_ALLOWED_RECIPIENTS).
                    Trimiterea manuală din fișa lead-ului funcționează.
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={save} disabled={busy !== null || !email.trim()} className="bg-amber-500 text-black hover:bg-amber-400">
                {busy === 'save' ? <Loader2 className="animate-spin" /> : lead ? <RotateCcw /> : <FlaskConical />}
                {lead ? 'Salvează și resetează' : 'Creează lead-ul de test'}
              </Button>
              {lead && (
                <>
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => { setOpen(false); onOpen(lead.id); }}>
                    Deschide
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={syncReplies}>
                    {busy === 'sync' && <Loader2 className="animate-spin" />}
                    Verifică răspunsurile
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy !== null} onClick={remove} className="ml-auto text-red-400/90 hover:text-red-300 hover:bg-red-500/10">
                    {busy === 'delete' ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    Șterge
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] text-stone-500 uppercase tracking-[0.15em] font-medium">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full bg-stone-950/60 border border-stone-800/60 rounded-lg px-3 py-2 text-sm text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500/40';
