// src/app/(dashboard)/educational-templates/page.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, Send, Edit, Trash2, Mail, Smartphone, MessageCircle, Target, Plus, Inbox, Check, Search, Users } from 'lucide-react';
import { formatWhatsAppLink } from '@/lib/utils';
import { logWhatsAppSend } from '@/lib/sent-messages-client';
import { Lead } from '@/services/leads/types';
import AddClientModal from '@/components/AddClientModal';
import { SentMessagesTable } from '@/components/messages/SentMessagesTable';
import { LeadDetailDialog } from '@/components/leads/LeadDetailDialog';

export const dynamic = 'force-dynamic';

interface Template {
  id: string;
  title: string;
  content: string;
  service: string | null;
  // Tipul de caz în care se folosește șablonul; null = generic (vezi CASE_TYPES)
  case_type: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface Client {
  email: string;
  name: string;
}

interface ScheduledMessage {
  id: string;
  template_title: string;
  service_filter: string | null;
  time_filter: string | null;
  scheduled_at: string;
  status: string;
}

const DEFAULT_TEMPLATE_CONTENT = `<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Propunere</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F5F0E8; margin: 0; padding: 0;">
  <div style="max-width: 520px; margin: 40px auto; background: #ffffff; border-radius: 24px; box-shadow: 0 10px 40px rgba(26, 24, 20, 0.10); overflow: hidden;">

    <!-- Header cu logo -->
    <div style="background: linear-gradient(180deg, #b2d0ff 0%, #8fbafe 25%, #7caeff 50%, #6da2ff 75%, #598ee9 100%); padding: 40px 24px; text-align: center;">
      <img src="cid:utopia-logo" alt="Utopia" style="max-width: 180px; height: auto; display: block; margin: 0 auto;">
      <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 12px 0 0;">Analiză gratuită pentru business-ul tău</p>
    </div>

    <!-- Conținut -->
    <div style="padding: 36px 28px;">
      <p style="color: #1a1814; font-size: 17px; margin: 0 0 20px;">👋 Bună <strong>{{name}}</strong>,</p>

      <p style="color: #1a1814; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        În urma unei analize a business-urilor din nișa voastră, am găsit o serie de puncte slabe care determină clienții să ajungă la competiție.
      </p>

      <p style="color: #1a1814; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">
        Ți-am pregătit o listă cu avantajele pe care competiția ta le are, plus soluția pe care ți-o pun la dispoziție.
      </p>

      <p style="color: #1a1814; font-size: 15px; line-height: 1.7; margin: 0 0 28px;">
        Totul se discută într-un meeting de 10 minute, fie online, fie telefonic.
      </p>

      <!-- CTA -->
      <div style="text-align: center; margin-bottom: 28px;">
        <a href="https://www.utopia-systems.ro/meetings" style="display: inline-block; background: linear-gradient(180deg, #b2d0ff 0%, #6da2ff 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 12px rgba(109, 162, 255, 0.3);">
          Programează meeting →
        </a>
      </div>

      <div style="border-left: 3px solid #6da2ff; padding: 4px 0 4px 16px; margin-bottom: 24px;">
        <p style="color: rgba(26,24,20,0.45); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 4px;">Sau direct la telefon</p>
        <p style="color: #1a1814; font-size: 15px; font-weight: 600; margin: 0;">📞 0756 942 811</p>
      </div>

      <p style="color: rgba(26,24,20,0.55); font-size: 13px; line-height: 1.6; margin: 0;">
        Dacă nu ești interesat, un reply scurt e suficient — nu te mai contactez.
      </p>
    </div>

    <!-- Footer -->
    <div style="background: #1a1814; padding: 24px; text-align: center;">
      <img src="cid:utopia-logo" alt="Utopia Systems" style="width: 130px; max-width: 50%; height: auto; display: block; margin: 0 auto 12px;" />
      <p style="color: rgba(245,240,232,0.5); font-size: 12px; margin: 0;">Alex Vezentan — Software & Web Developer</p>
      <p style="color: rgba(245,240,232,0.5); font-size: 12px; margin: 4px 0 0;">© 2026 — Toate drepturile rezervate</p>
    </div>
  </div>
</body>
</html>`;

const TIME_FILTERS = [
  { value: '30_days', label: 'Ultimele 30 zile' },
  { value: '3_months', label: 'Ultimii 3 luni' },
  { value: '6_months', label: 'Ultimii 6 luni' },
  { value: '12_months', label: 'Ultimii 12 luni' },
  { value: 'all', label: 'Toate' }
];

// Tipurile de caz în care se folosește un șablon. Valoarea goală = „Generic"
// (se salvează ca NULL în `educational_templates.case_type`).
// Nu au legătură cu `service` — acela rămâne serviciul oferit clientului.
const CASE_TYPES = [
  { value: '', label: 'Generic' },
  { value: 'after_call', label: 'After call' },
  { value: 'offer_request', label: 'Offer request' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'cold_outreach', label: 'Cold outreach' }
];

export default function EducationalTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [servicii, setServicii] = useState<string[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState('');
  const [activeTab, setActiveTab] = useState<'sending' | 'scheduled' | 'sent'>('sending');
  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false);

  // Form state for template editing
  const [templateForm, setTemplateForm] = useState({
    title: '',
    content: '',
    service: '',
    case_type: ''
  });

  // Filter state
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [channel, setChannel] = useState<'email' | 'sms' | 'whatsapp'>('email');
  // Tab-ul activ din „Opțiuni Trimitere" — una din valorile CASE_TYPES ('' = Generic)
  const [caseTypeFilter, setCaseTypeFilter] = useState<string>('');

  // Lead filter/selection state
  const [leads, setLeads] = useState<Lead[]>([]);
  // Fișa lead-ului (detalii + pitch + istoric), deschisă din lista de lead-uri
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);
  const [leadNicheFilter, setLeadNicheFilter] = useState<string>('all');
  const [leadScoreFilter, setLeadScoreFilter] = useState<string>('all');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);

  const fetchLeads = async () => {
    try {
      const response = await fetch('/api/leads');
      if (!response.ok) throw new Error('Failed to fetch leads');
      const data = await response.json();
      setLeads(data || []);
    } catch (error) {
      console.error('Error fetching leads:', error);
      setLeads([]);
    }
  };

  async function handleDeleteLead(lead: Lead) {
    // Ștergerea e definitivă și nu are „undo", deci cerem o confirmare explicită
    const ok = window.confirm(
      `Ștergi definitiv lead-ul „${lead.company_name}"?

Dispar și notele lui din istoric. Acțiunea nu poate fi anulată.`
    );
    if (!ok) return;

    setDeletingLeadId(lead.id);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Eroare la ștergere');

      setLeads((prev) => prev.filter((l) => l.id !== lead.id));
      // Lead-ul șters nu mai poate rămâne selectat pentru trimitere
      setSelectedLeadIds((prev) => prev.filter((id) => id !== lead.id));
      if (editingLead?.id === lead.id) setEditingLead(null);
    } catch (error) {
      console.error('Error deleting lead:', error);
    } finally {
      setDeletingLeadId(null);
    }
  }

  useEffect(() => {
    // Clienții se încarcă din efectul pe filtre (mai jos), care rulează și la montare
    fetchTemplates();
    fetchScheduledMessages();
    fetchLeads();
    fetch('/api/bookings?services=1')
      .then(r => r.json())
      .then((data: string[]) => setServicii(data))
      .catch(() => setServicii([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leadNiches = Array.from(new Set(leads.map(l => l.niche).filter((n): n is string => !!n))).sort();

  const matchesScoreFilter = (l: Lead) => {
    if (leadScoreFilter === 'all') return true;
    if (l.score === null) return false;
    if (leadScoreFilter === 'low') return l.score < 40;
    if (leadScoreFilter === 'medium') return l.score >= 40 && l.score <= 70;
    if (leadScoreFilter === 'high') return l.score > 70;
    return true;
  };

  const nicheFilteredLeads = leads.filter(
    l => (leadNicheFilter === 'all' || l.niche === leadNicheFilter) && matchesScoreFilter(l)
  );
  const hasContact = (lead: Lead) =>
    channel === 'sms' || channel === 'whatsapp' ? !!lead.contact_phone : !!lead.contact_email;
  const selectableLeads = nicheFilteredLeads.filter(hasContact);

  // La schimbarea canalului, unele lead-uri selectate pot să nu mai aibă contactul necesar
  useEffect(() => {
    setSelectedLeadIds([]);
  }, [channel]);

  // Șabloanele afișate în „Opțiuni Trimitere", grupate după tipul de caz.
  // Un case_type necunoscut (ex. rămas de la o versiune veche) cade pe „Generic",
  // ca să nu existe șabloane fără niciun tab în care să apară.
  const knownCaseTypes = CASE_TYPES.map((c) => c.value);
  const caseTypeOf = (t: Template) =>
    t.case_type && knownCaseTypes.includes(t.case_type) ? t.case_type : '';
  const templatesForCaseType = (caseType: string) =>
    templates.filter((t) => caseTypeOf(t) === caseType);
  const visibleTemplates = templatesForCaseType(caseTypeFilter);

  // Un șablon selectat dintr-un alt tip de caz ar rămâne activ, dar invizibil în listă
  useEffect(() => {
    if (isEditing) return;
    setSelectedTemplate((prev) => (prev && caseTypeOf(prev) !== caseTypeFilter ? null : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseTypeFilter, isEditing]);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/educational-templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      const data = await response.json();
      setTemplates(data || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      setTemplates([]);
    }
  };

  const fetchClients = async () => {
    try {
      const params = new URLSearchParams();
      if (serviceFilter !== 'all') params.append('service', serviceFilter);
      params.append('timeFilter', timeFilter);

      const response = await fetch(`/api/bookings?${params}`);
      if (!response.ok) throw new Error('Failed to fetch bookings');
      const bookings = await response.json();

      // Extract unique clients
      const clientMap = new Map<string, Client>();
      bookings.forEach((booking: { email: string; name: string }) => {
        if (booking.email && !clientMap.has(booking.email)) {
          clientMap.set(booking.email, {
            email: booking.email,
            name: booking.name,
          });
        }
      });

      setClients(Array.from(clientMap.values()));
    } catch (error) {
      console.error('Error fetching clients:', error);
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchScheduledMessages = async () => {
    try {
      const response = await fetch('/api/scheduled-messages');
      if (!response.ok) throw new Error('Failed to fetch scheduled messages');
      const data = await response.json();
      setScheduledMessages(data || []);
    } catch (error) {
      console.error('Error fetching scheduled messages:', error);
      setScheduledMessages([]);
    }
  };

  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template);
    setIsEditing(false);
  };

  const handleEditTemplate = (template: Template) => {
    setSelectedTemplate(template);
    setTemplateForm({
      title: template.title,
      content: template.content,
      service: template.service || '',
      case_type: caseTypeOf(template)
    });
    setIsEditing(true);
  };

  const handleSaveTemplate = async () => {
    if (!templateForm.title || !templateForm.content) {
      alert('Completează titlul și conținutul');
      return;
    }

    try {
      const method = selectedTemplate && !selectedTemplate.is_default ? 'PUT' : 'POST';
      const body = selectedTemplate && !selectedTemplate.is_default
        ? { id: selectedTemplate.id, ...templateForm }
        : templateForm;

      const response = await fetch('/api/educational-templates', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save template');
      }

      await fetchTemplates();
      setIsEditing(false);
      setSelectedTemplate(null);
      setTemplateForm({ title: '', content: '', service: '', case_type: '' });
    } catch (error) {
      console.error('Error saving template:', error);
      alert(`Eroare la salvarea șablonului: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleDeleteTemplate = async (template: Template) => {
    if (template.is_default) return;

    if (!confirm('Sigur doriți să ștergeți acest template?')) return;

    try {
      const response = await fetch(`/api/educational-templates?id=${template.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete template');

      await fetchTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Eroare la ștergerea șablonului');
    }
  };

  const handleSendMessage = async (immediate: boolean = true) => {
    if (!selectedTemplate) return;

    if (selectedClients.length === 0 && selectedLeadIds.length === 0 && serviceFilter === 'all') {
      alert('Selectați clienți, lead-uri sau aplicați un filtru');
      return;
    }

    if (selectedClients.length > 100 || selectedLeadIds.length > 100) {
      alert('Prea mulți destinatari (maximum 100 per categorie)');
      return;
    }

    setSending(true);
    setSendProgress('Se trimite...');

    try {
      const body = {
        templateId: selectedTemplate.id,
        serviceFilter: serviceFilter !== 'all' ? serviceFilter : null,
        timeFilter,
        recipientEmails: selectedClients.length > 0 ? selectedClients : null,
        leadIds: selectedLeadIds.length > 0 ? selectedLeadIds : null,
        channel,
        ...(immediate ? {} : { scheduledAt }),
      };

      const response = await fetch('/api/educational-templates/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Eroare la trimitere');

      setSendProgress(data.message);
      if (immediate) {
        await fetchScheduledMessages();
      } else {
        setScheduledAt('');
      }
      setTimeout(() => setSendProgress(''), 3000);
    } catch (error) {
      console.error('Error sending emails:', error);
      setSendProgress(`Eroare: ${error instanceof Error ? error.message : 'necunoscută'}`);
      setTimeout(() => setSendProgress(''), 6000);
    } finally {
      setSending(false);
    }
  };

  const handleCancelScheduled = async (id: string) => {
    if (!confirm('Sigur doriți să anulați mesajul programat?')) return;

    try {
      const response = await fetch(`/api/scheduled-messages?id=${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to cancel scheduled message');

      await fetchScheduledMessages();
    } catch (error) {
      console.error('Error canceling scheduled message:', error);
      alert('Eroare la anularea mesajului');
    }
  };

  // ─── Wizard: Destinatari → Mesaj → Trimite ────────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [audience, setAudience] = useState<'clients' | 'leads'>('clients');
  const [recipientQuery, setRecipientQuery] = useState('');
  const [sendMode, setSendMode] = useState<'now' | 'later'>('now');

  // Filtrele se aplică imediat. Lista de clienți vine de pe server, iar o
  // selecție făcută pe lista veche n-ar mai corespunde celei noi.
  useEffect(() => {
    fetchClients();
    setSelectedClients([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceFilter, timeFilter]);

  useEffect(() => {
    setSelectedLeadIds([]);
  }, [leadNicheFilter, leadScoreFilter]);

  // WhatsApp se trimite manual, doar către lead-uri cu telefon
  useEffect(() => {
    if (channel === 'whatsapp') {
      setAudience('leads');
      setSelectedClients([]);
      setSendMode('now');
    }
  }, [channel]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-stone-500">
          <div className="w-5 h-5 border-2 border-stone-700 border-t-amber-500 rounded-full animate-spin" />
          <span>Se încarcă șabloanele...</span>
        </div>
      </div>
    );
  }

  const CHANNELS = [
    { value: 'email' as const, label: 'Email', hint: 'Trimis din CRM', icon: Mail },
    { value: 'sms' as const, label: 'SMS', hint: 'Necesită Twilio', icon: Smartphone },
    { value: 'whatsapp' as const, label: 'WhatsApp', hint: 'Manual, de pe telefon', icon: MessageCircle },
  ];
  const channelLabel = CHANNELS.find((c) => c.value === channel)?.label ?? 'Email';
  const contactNoun = channel === 'email' ? 'email' : 'telefon';

  const query = recipientQuery.trim().toLowerCase();
  const matchesQuery = (...values: (string | null | undefined)[]) =>
    !query || values.some((v) => v?.toLowerCase().includes(query));
  const visibleClients = clients.filter((c) => matchesQuery(c.name, c.email));
  const visibleLeads = nicheFilteredLeads.filter((l) =>
    matchesQuery(l.company_name, l.contact_email, l.contact_phone)
  );
  const selectableVisibleLeads = visibleLeads.filter(hasContact);
  const selectedLeads = leads.filter((l) => selectedLeadIds.includes(l.id));

  const recipientCount = selectedClients.length + selectedLeadIds.length;
  // Fără selecție explicită, un filtru de serviciu trimite către toți clienții lui
  const hasRecipients = recipientCount > 0 || serviceFilter !== 'all';
  const canReach = (n: 1 | 2 | 3) => n === 1 || (hasRecipients && (n === 2 || !!selectedTemplate));
  const canContinue = step < 3 && canReach((step + 1) as 2 | 3);

  const allClientsChecked =
    visibleClients.length > 0 && visibleClients.every((c) => selectedClients.includes(c.email));
  const allLeadsChecked =
    selectableVisibleLeads.length > 0 && selectableVisibleLeads.every((l) => selectedLeadIds.includes(l.id));

  const toggleAllVisible = () => {
    if (audience === 'clients') {
      const emails = visibleClients.map((c) => c.email);
      setSelectedClients((prev) =>
        allClientsChecked ? prev.filter((e) => !emails.includes(e)) : Array.from(new Set([...prev, ...emails]))
      );
    } else {
      const ids = selectableVisibleLeads.map((l) => l.id);
      setSelectedLeadIds((prev) =>
        allLeadsChecked ? prev.filter((id) => !ids.includes(id)) : Array.from(new Set([...prev, ...ids]))
      );
    }
  };

  const previewName =
    clients.find((c) => selectedClients.includes(c.email))?.name || selectedLeads[0]?.company_name || 'Client';
  const previewHtml = selectedTemplate?.content.replace(/\{\{name\}\}/g, previewName) ?? '';

  const whatsappMessage = (lead: Lead) =>
    lead.pitch_generated ?? (selectedTemplate?.content.replace(/\{\{name\}\}/g, lead.company_name) ?? '');

  const sendNowDisabled =
    !selectedTemplate || (selectedClients.length === 0 && selectedLeadIds.length === 0 && serviceFilter === 'all') || sending;
  // Programarea suportă deocamdată doar clienți, nu și lead-uri
  const scheduleDisabled = !selectedTemplate || selectedClients.length === 0 || !scheduledAt || sending;

  const recipientSummary = [
    selectedClients.length > 0 && `${selectedClients.length} ${selectedClients.length === 1 ? 'client' : 'clienți'}`,
    selectedLeadIds.length > 0 && `${selectedLeadIds.length} ${selectedLeadIds.length === 1 ? 'lead' : 'lead-uri'}`,
  ].filter(Boolean).join(' · ') || (serviceFilter !== 'all' ? `Toți clienții „${serviceFilter}”` : 'Niciun destinatar');

  const STEPS = [
    { n: 1 as const, label: 'Destinatari', sub: recipientSummary },
    { n: 2 as const, label: 'Mesaj', sub: selectedTemplate ? `${channelLabel} · ${selectedTemplate.title}` : 'Alege un șablon' },
    { n: 3 as const, label: 'Trimite', sub: channel === 'whatsapp' ? 'Manual, câte un lead' : sendMode === 'now' ? 'Acum' : scheduledAt ? scheduledAt.replace('T', ' ') : 'Programat' },
  ];

  const segBtn = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-medium transition ${
      active ? 'bg-stone-50 text-stone-950' : 'text-stone-400 hover:text-stone-200'
    }`;
  const pickCls = (active: boolean) =>
    `border transition ${
      active
        ? 'bg-orange-500/15 border-orange-500 text-stone-100'
        : 'bg-neutral-950 border-neutral-800 text-stone-100 hover:border-neutral-700'
    }`;
  const card = 'bg-neutral-900 border border-neutral-800 rounded-2xl';
  const selectCls = 'bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-stone-100';

  return (
    /* `educational-templates` = hook pentru raza universală din globals.css */
    <div className="educational-templates space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="page-title text-stone-100">Șabloane Educaționale &amp; Emailuri</h1>
        <nav className="inline-flex gap-1 p-1 rounded-full border border-neutral-800">
          {([
            ['sending', 'Trimitere'],
            ['scheduled', 'Programate'],
            ['sent', 'Trimise'],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)} className={segBtn(activeTab === key)}>
              {label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'sending' && isEditing && (
        /* Template Creation/Editing */
        <div className={`${card} p-6 max-w-3xl`}>
          <h2 className="font-serif text-2xl text-stone-100 mb-4">
            {selectedTemplate && !selectedTemplate.is_default ? 'Editează șablon' : 'Șablon nou'}
          </h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-stone-300 text-sm font-medium mb-2">
                Titlu / Subiect Email
              </label>
              <input
                id="title"
                type="text"
                value={templateForm.title}
                onChange={(e) => setTemplateForm({ ...templateForm, title: e.target.value })}
                placeholder="ex: Follow-up după consultație"
                className={`w-full ${selectCls} placeholder-stone-600`}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="case_type" className="block text-stone-300 text-sm font-medium mb-2">Tip de caz</label>
                <select
                  id="case_type"
                  value={templateForm.case_type}
                  onChange={(e) => setTemplateForm({ ...templateForm, case_type: e.target.value })}
                  className={`w-full ${selectCls}`}
                >
                  {CASE_TYPES.map((caseType) => (
                    <option key={caseType.value || '__generic__'} value={caseType.value}>
                      {caseType.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="service" className="block text-stone-300 text-sm font-medium mb-2">Serviciu (opțional)</label>
                <select
                  id="service"
                  value={templateForm.service}
                  onChange={(e) => setTemplateForm({ ...templateForm, service: e.target.value })}
                  className={`w-full ${selectCls}`}
                >
                  <option value="">Toate serviciile</option>
                  {servicii.map((service) => (
                    <option key={service} value={service}>{service}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="content" className="block text-stone-300 text-sm font-medium mb-2">Conținut (HTML)</label>
              <textarea
                id="content"
                value={templateForm.content}
                onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })}
                rows={14}
                className={`w-full ${selectCls} font-mono`}
                placeholder="Folosește {{name}} pentru numele clientului"
              />
            </div>
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => setIsEditing(false)}
                className="rounded-full border border-neutral-700 px-5 py-2.5 text-sm text-stone-200 hover:bg-neutral-800 transition"
              >
                Renunță
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={sending}
                className="rounded-full bg-orange-600 hover:bg-orange-700 text-white font-medium px-5 py-2.5 text-sm transition disabled:opacity-50"
              >
                {sending ? 'Se salvează...' : 'Salvează șablon'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sending' && !isEditing && (
        <div className="space-y-5">
          {/* ── Pașii ─────────────────────────────────────────────── */}
          <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {STEPS.map((s) => {
              const current = step === s.n;
              const done = step > s.n;
              return (
                <li key={s.n}>
                  <button
                    onClick={() => canReach(s.n) && setStep(s.n)}
                    disabled={!canReach(s.n)}
                    aria-current={current ? 'step' : undefined}
                    className={`w-full flex items-center gap-3 text-left px-4 py-3.5 rounded-2xl bg-neutral-900 border transition disabled:cursor-not-allowed ${
                      current ? 'border-orange-500' : 'border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <span
                      className={`shrink-0 w-7 h-7 rounded-full grid place-items-center font-mono text-xs ${
                        current
                          ? 'bg-orange-500 text-white'
                          : done
                            ? 'bg-stone-50 text-stone-950'
                            : 'bg-neutral-800 text-stone-400'
                      }`}
                    >
                      {done ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : s.n}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-stone-100">{s.label}</span>
                      <span className="block text-xs text-stone-500 truncate">{s.sub}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          {/* ── Pasul 1: Destinatari ──────────────────────────────── */}
          {step === 1 && (
            <div className={`${card} p-5 sm:p-6 space-y-5`}>
              <div>
                <p className="text-sm font-medium text-stone-400 mb-2">Canal de trimitere</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {CHANNELS.map(({ value, label, hint, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setChannel(value)}
                      className={`flex items-center gap-3 rounded-xl p-3 text-left ${pickCls(channel === value)}`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>
                        <span className="block text-sm font-semibold">{label}</span>
                        <span className="block text-xs text-stone-500">{hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
                {channel === 'sms' && (
                  <p className="text-xs text-amber-400 mt-2">
                    SMS necesită configurare Twilio în .env (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)
                  </p>
                )}
                {channel === 'whatsapp' && (
                  <p className="text-xs text-amber-400 mt-2">
                    WhatsApp se trimite manual, de pe numărul tău personal — doar către lead-uri cu telefon completat.
                  </p>
                )}
              </div>

              <div className="h-px" />

              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex gap-1 p-1 rounded-full bg-neutral-950">
                  <button
                    onClick={() => setAudience('clients')}
                    disabled={channel === 'whatsapp'}
                    className={`${segBtn(audience === 'clients')} inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    <Users className="w-3.5 h-3.5" /> Clienți
                    <span className="font-mono text-xs opacity-70">{clients.length}</span>
                  </button>
                  <button
                    onClick={() => setAudience('leads')}
                    className={`${segBtn(audience === 'leads')} inline-flex items-center gap-2`}
                  >
                    <Target className="w-3.5 h-3.5" /> Lead-uri
                    <span className="font-mono text-xs opacity-70">{nicheFilteredLeads.length}</span>
                  </button>
                </div>

                <label className="flex-1 min-w-[200px] flex items-center gap-2 rounded-full bg-neutral-950 border border-neutral-800 px-4">
                  <Search className="w-4 h-4 text-stone-500 shrink-0" />
                  <input
                    value={recipientQuery}
                    onChange={(e) => setRecipientQuery(e.target.value)}
                    placeholder="Caută după nume sau contact"
                    aria-label="Caută destinatari"
                    className="flex-1 min-w-0 bg-transparent border-0 py-2.5 text-sm text-stone-100 placeholder-stone-600 focus:outline-none"
                  />
                </label>

                {audience === 'clients' ? (
                  <>
                    <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} aria-label="Filtru serviciu" className={selectCls}>
                      <option value="all">Toate serviciile</option>
                      {servicii.map((service) => (
                        <option key={service} value={service}>{service}</option>
                      ))}
                    </select>
                    <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)} aria-label="Filtru timp" className={selectCls}>
                      {TIME_FILTERS.map((filter) => (
                        <option key={filter.value} value={filter.value}>{filter.label}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <>
                    <select value={leadNicheFilter} onChange={(e) => setLeadNicheFilter(e.target.value)} aria-label="Filtru nișă" className={selectCls}>
                      <option value="all">Toate nișele</option>
                      {leadNiches.map((niche) => (
                        <option key={niche} value={niche}>{niche}</option>
                      ))}
                    </select>
                    <select value={leadScoreFilter} onChange={(e) => setLeadScoreFilter(e.target.value)} aria-label="Filtru scor" className={selectCls}>
                      <option value="all">Toate scorurile</option>
                      <option value="low">Scor sub 40 — oportunitate mare</option>
                      <option value="medium">Scor 40–70</option>
                      <option value="high">Scor peste 70</option>
                    </select>
                  </>
                )}

                <button
                  onClick={() => setIsAddClientModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium px-4 py-2 transition"
                >
                  <Plus className="w-4 h-4" /> Add Client
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <label className="flex items-center gap-2.5 text-sm text-stone-400">
                  <input
                    type="checkbox"
                    checked={audience === 'clients' ? allClientsChecked : allLeadsChecked}
                    onChange={toggleAllVisible}
                    className="w-4 h-4 accent-orange-500"
                  />
                  Selectează toți {audience === 'leads' ? 'contactabilii' : 'clienții'} afișați
                </label>
                <span className="font-mono text-xs text-stone-500">
                  {audience === 'clients'
                    ? `${visibleClients.length} afișați · ${selectedClients.length} selectați`
                    : `${selectableVisibleLeads.length} din ${visibleLeads.length} au ${contactNoun} · ${selectedLeadIds.length} selectați`}
                </span>
              </div>

              {audience === 'clients' ? (
                visibleClients.length === 0 ? (
                  <p className="text-sm text-stone-500 text-center py-8">Niciun client pentru filtrele curente.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-[420px] overflow-y-auto content-start">
                    {visibleClients.map((client) => {
                      const checked = selectedClients.includes(client.email);
                      return (
                        <label
                          key={client.email}
                          className={`flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer ${pickCls(checked)}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setSelectedClients((prev) =>
                                e.target.checked ? [...prev, client.email] : prev.filter((em) => em !== client.email)
                              )
                            }
                            className="w-4 h-4 accent-orange-500 shrink-0"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium truncate">{client.name || 'Fără nume'}</span>
                            <span className="block font-mono text-xs text-stone-500 truncate">{client.email}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )
              ) : visibleLeads.length === 0 ? (
                <p className="text-sm text-stone-500 text-center py-8">Niciun lead pentru filtrele curente.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 max-h-[420px] overflow-y-auto content-start">
                  {visibleLeads.map((lead) => {
                    const contactable = hasContact(lead);
                    const checked = selectedLeadIds.includes(lead.id);
                    const contactValue = channel === 'email' ? lead.contact_email : lead.contact_phone;
                    return (
                      <div
                        key={lead.id}
                        className={`flex items-center gap-3 rounded-xl px-4 py-3 ${pickCls(checked)} ${!contactable ? 'opacity-50' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!contactable}
                          aria-label={`Selectează ${lead.company_name}`}
                          title={!contactable ? `Fără ${contactNoun} completat` : undefined}
                          onChange={(e) =>
                            setSelectedLeadIds((prev) =>
                              e.target.checked ? [...prev, lead.id] : prev.filter((id) => id !== lead.id)
                            )
                          }
                          className="w-4 h-4 accent-orange-500 shrink-0 disabled:cursor-not-allowed"
                        />
                        <span className="flex-1 min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate">{lead.company_name}</span>
                            {lead.score !== null && (
                              <span
                                className={`shrink-0 font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                  lead.score < 40
                                    ? 'bg-red-500/15 text-red-400'
                                    : lead.score <= 70
                                      ? 'bg-yellow-500/15 text-yellow-400'
                                      : 'bg-emerald-500/15 text-emerald-400'
                                }`}
                              >
                                {lead.score}
                              </span>
                            )}
                          </span>
                          <span className={`block font-mono text-xs truncate ${contactable ? 'text-stone-500' : 'text-stone-600 italic'}`}>
                            {contactValue ?? `fără ${contactNoun}`}
                          </span>
                        </span>
                        {/* Editare fișă — util mai ales pentru lead-urile fără contact,
                            care altfel nu pot fi selectate pentru trimitere */}
                        <button
                          onClick={() => setEditingLead(lead)}
                          title="Editează detaliile lead-ului"
                          aria-label={`Editează ${lead.company_name}`}
                          className="shrink-0 text-stone-500 hover:text-stone-100 p-1"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteLead(lead)}
                          disabled={deletingLeadId === lead.id}
                          title="Șterge lead-ul"
                          aria-label={`Șterge ${lead.company_name}`}
                          className="shrink-0 text-stone-500 hover:text-red-400 p-1 disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Pasul 2: Mesaj ────────────────────────────────────── */}
          {step === 2 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <div className={`${card} p-5 sm:p-6 space-y-5`}>
                <div>
                  <p className="text-sm font-medium text-stone-400 mb-2">Tip de caz</p>
                  <div className="flex flex-wrap gap-2">
                    {CASE_TYPES.map((caseType) => (
                      <button
                        key={caseType.value || '__generic__'}
                        onClick={() => setCaseTypeFilter(caseType.value)}
                        className={`rounded-full px-3 py-1.5 text-sm ${pickCls(caseTypeFilter === caseType.value)}`}
                      >
                        {caseType.label}{' '}
                        <span className="font-mono text-xs text-stone-500">{templatesForCaseType(caseType.value).length}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-stone-400">Șablon</p>
                    <button
                      onClick={() => {
                        setSelectedTemplate(null);
                        // Preîncarcă tipul de caz al tab-ului activ ('' = Generic)
                        setTemplateForm({
                          title: '',
                          content: DEFAULT_TEMPLATE_CONTENT,
                          service: '',
                          case_type: caseTypeFilter,
                        });
                        setIsEditing(true);
                      }}
                      className="inline-flex items-center gap-1 text-sm font-medium text-orange-500 hover:text-orange-400"
                    >
                      <Plus className="w-4 h-4" /> Șablon nou
                    </button>
                  </div>
                  <div className="space-y-2 max-h-[360px] overflow-y-auto">
                    {visibleTemplates.length === 0 && (
                      <p className="text-stone-500 text-sm py-2">
                        Niciun șablon pentru acest tip de caz. Creează primul cu „Șablon nou”.
                      </p>
                    )}
                    {visibleTemplates.map((template) => {
                      const active = selectedTemplate?.id === template.id;
                      return (
                        <div
                          key={template.id}
                          className={`flex items-center gap-3 rounded-xl px-4 py-3 ${pickCls(active)}`}
                        >
                          <button onClick={() => handleTemplateSelect(template)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                            <span
                              className={`shrink-0 w-4 h-4 rounded-full border-2 ${
                                active ? 'border-orange-500 bg-orange-500 ring-2 ring-inset ring-neutral-950' : 'border-stone-600'
                              }`}
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium truncate">{template.title}</span>
                              <span className="block text-xs text-stone-500">{template.service || 'Toate serviciile'}</span>
                            </span>
                          </button>
                          {!template.is_default && (
                            <div className="flex gap-1 shrink-0">
                              <button
                                onClick={() => handleEditTemplate(template)}
                                aria-label={`Editează ${template.title}`}
                                className="text-stone-500 hover:text-stone-100 p-1"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteTemplate(template)}
                                aria-label={`Șterge ${template.title}`}
                                className="text-stone-500 hover:text-red-400 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Previzualizare: HTML-ul real al șablonului, izolat într-un iframe fără scripturi */}
              <div className={`${card} overflow-hidden`}>
                <div className="px-5 py-3 border-b border-neutral-800 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-stone-500">
                    Previzualizare · {channelLabel}
                  </span>
                  <span className="text-xs text-stone-500">
                    către <b className="font-semibold text-stone-200">{previewName}</b>
                  </span>
                </div>
                {selectedTemplate ? (
                  <iframe
                    title="Previzualizare șablon"
                    sandbox=""
                    srcDoc={previewHtml}
                    className="w-full h-[520px] bg-white"
                  />
                ) : (
                  <p className="text-sm text-stone-500 text-center px-6 py-24">Alege un șablon ca să vezi mesajul.</p>
                )}
              </div>
            </div>
          )}

          {/* ── Pasul 3: Trimite ──────────────────────────────────── */}
          {step === 3 && (
            <div className={`${card} p-5 sm:p-6 space-y-5 max-w-3xl`}>
              <div>
                <h2 className="font-serif text-3xl text-stone-100">Gata de trimis</h2>
                <p className="text-sm text-stone-500">Verifică rezumatul, apoi trimite acum sau programează.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="rounded-xl bg-neutral-950 p-3.5">
                  <p className="text-xs text-stone-500">Destinatari</p>
                  <p className="font-serif text-3xl leading-tight text-stone-100">{recipientCount || '—'}</p>
                  <p className="text-xs text-stone-500 truncate">{recipientSummary}</p>
                </div>
                <div className="rounded-xl bg-neutral-950 p-3.5">
                  <p className="text-xs text-stone-500">Canal</p>
                  <p className="text-sm font-semibold text-stone-100 mt-1">{channelLabel}</p>
                </div>
                <div className="rounded-xl bg-neutral-950 p-3.5">
                  <p className="text-xs text-stone-500">Șablon</p>
                  <p className="text-sm font-semibold text-stone-100 mt-1 truncate">{selectedTemplate?.title ?? '—'}</p>
                </div>
              </div>

              {channel === 'whatsapp' ? (
                <div className="space-y-2">
                  <p className="text-sm text-stone-400">
                    Deschide conversația pentru fiecare lead. Se folosește pitch-ul generat al lead-ului, iar dacă lipsește, șablonul ales.
                  </p>
                  {selectedLeads.map((lead) => (
                    <div key={lead.id} className="flex items-center gap-3 rounded-xl bg-neutral-950 border border-neutral-800 px-4 py-3">
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-stone-100 truncate">{lead.company_name}</span>
                        <span className="block font-mono text-xs text-stone-500">{lead.contact_phone}</span>
                      </span>
                      <button
                        onClick={() => {
                          const message = whatsappMessage(lead);
                          window.open(formatWhatsAppLink(lead.contact_phone!, message), '_blank');
                          logWhatsAppSend(lead, message);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 transition"
                      >
                        <MessageCircle className="w-4 h-4" /> Deschide WhatsApp
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="inline-flex gap-1 p-1 rounded-full bg-neutral-950">
                    <button onClick={() => setSendMode('now')} className={segBtn(sendMode === 'now')}>Trimite acum</button>
                    <button onClick={() => setSendMode('later')} className={segBtn(sendMode === 'later')}>Programează</button>
                  </div>

                  {sendMode === 'later' && (
                    <div className="space-y-1.5">
                      <label htmlFor="scheduled_at" className="block text-sm text-stone-400">Data și ora</label>
                      <input
                        id="scheduled_at"
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        className={`${selectCls} min-w-[260px]`}
                      />
                      <p className="text-xs text-stone-500">Programarea suportă deocamdată doar clienți, nu și lead-uri.</p>
                    </div>
                  )}

                  <button
                    onClick={() => handleSendMessage(sendMode === 'now')}
                    disabled={sendMode === 'now' ? sendNowDisabled : scheduleDisabled}
                    className="inline-flex items-center gap-2 rounded-full bg-orange-600 hover:bg-orange-700 text-white font-semibold px-6 py-3 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendMode === 'now' ? <Send className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                    {sending
                      ? 'Se trimite...'
                      : sendMode === 'now'
                        ? `Trimite către ${recipientCount || 'filtru'}`
                        : `Programează pentru ${selectedClients.length}`}
                  </button>

                  {sendProgress && (
                    <p
                      role="status"
                      className={`text-sm ${sendProgress.startsWith('Eroare') ? 'text-red-400' : 'text-emerald-400'}`}
                    >
                      {sendProgress}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Bara de navigare ──────────────────────────────────── */}
          <div className="sticky bottom-0 z-10 -mx-6 lg:-mx-8 -mb-6 lg:-mb-8 px-6 lg:px-8 py-4 bg-neutral-950/90 backdrop-blur border-t border-neutral-800 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-stone-500 min-w-0 truncate">
              <b className="font-semibold text-stone-100">{recipientSummary}</b>
              {' · '}{channelLabel}{' · '}{selectedTemplate?.title ?? 'fără șablon'}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2) : s))}
                disabled={step === 1}
                className="rounded-full border border-neutral-700 px-5 py-2 text-sm text-stone-200 hover:bg-neutral-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Înapoi
              </button>
              {step < 3 && (
                <button
                  onClick={() => canContinue && setStep((s) => (s + 1) as 2 | 3)}
                  disabled={!canContinue}
                  className="rounded-full bg-stone-50 text-stone-950 px-5 py-2 text-sm font-semibold transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Continuă
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sent' && (
        /* Sent Messages & Emails */
        <div className={`${card} p-6`}>
          <h2 className="font-serif text-2xl text-stone-100 flex items-center gap-2 mb-1">
            <Inbox className="w-5 h-5" />
            Mesaje &amp; Mail-uri Trimise
          </h2>
          <p className="text-xs text-stone-500 mb-4">
            Toate email-urile, SMS-urile și mesajele WhatsApp trimise către clienți și lead-uri.
            Apasă pe o linie pentru a vedea conținutul trimis.
          </p>
          <SentMessagesTable emptyMessage="Niciun mesaj trimis încă. Trimiterile apar aici imediat după ce pleacă." />
        </div>
      )}

      {activeTab === 'scheduled' && (
        /* Scheduled Messages */
        <div className={`${card} p-6`}>
          <h2 className="font-serif text-2xl text-stone-100 flex items-center gap-2 mb-4">
            <Calendar className="w-5 h-5" />
            Mesaje Programate
          </h2>
          {scheduledMessages.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-stone-500 text-sm">Niciun mesaj programat.</p>
              <button
                onClick={() => {
                  setActiveTab('sending');
                  setSendMode('later');
                }}
                className="rounded-full bg-stone-50 text-stone-950 px-5 py-2 text-sm font-semibold hover:opacity-90"
              >
                Programează un mesaj
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {scheduledMessages.map((msg) => (
                <div key={msg.id} className="flex items-center justify-between gap-3 rounded-xl bg-neutral-950 border border-neutral-800 px-4 py-3">
                  <div>
                    <h4 className="text-stone-100 font-medium">{msg.template_title}</h4>
                    <p className="font-mono text-xs text-stone-500">
                      {new Date(msg.scheduled_at).toLocaleString('ro-RO')}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCancelScheduled(msg.id)}
                    aria-label="Anulează mesajul programat"
                    className="text-stone-500 hover:text-red-400 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AddClientModal
        isOpen={isAddClientModalOpen}
        onClose={() => setIsAddClientModalOpen(false)}
        onCreated={() => { fetchClients(); fetchLeads(); }}
      />

      {editingLead && (
        <LeadDetailDialog
          lead={editingLead}
          initialTab="details"
          onClose={() => setEditingLead(null)}
          onUpdated={(updated) => {
            // Actualizarea locală ține lista în sincron fără un refetch complet
            setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
            setEditingLead(updated);
          }}
        />
      )}
    </div>
  );
}
