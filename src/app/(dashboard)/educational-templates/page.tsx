// src/app/(dashboard)/educational-templates/page.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, Send, Edit, Trash2, Mail, Smartphone, MessageCircle, Target, Plus } from 'lucide-react';
import { formatWhatsAppLink } from '@/lib/utils';
import { Lead } from '@/services/leads/types';
import AddClientModal from '@/components/AddClientModal';

export const dynamic = 'force-dynamic';

interface Template {
  id: string;
  title: string;
  content: string;
  service: string | null;
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
  const [activeTab, setActiveTab] = useState<'sending' | 'scheduled'>('sending');
  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false);

  // Form state for template editing
  const [templateForm, setTemplateForm] = useState({
    title: '',
    content: '',
    service: ''
  });

  // Filter state
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<string>('all');
  const [selectedClients, setSelectedClients] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [channel, setChannel] = useState<'email' | 'sms' | 'whatsapp'>('email');

  // Lead filter/selection state
  const [leads, setLeads] = useState<Lead[]>([]);
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

  useEffect(() => {
    fetchTemplates();
    fetchClients();
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
      service: template.service || ''
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
      setTemplateForm({ title: '', content: '', service: '' });
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

  const applyFilters = () => {
    fetchClients();
    setSelectedClients([]);
  };

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white">Șabloane Educaționale & Emailuri</h1>
      </div>

      <div className="flex gap-6 h-full">
        {/* Left Sidebar */}
        <div className="w-80 space-y-4">
          {/* Navigation */}
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-4">
            <nav className="space-y-2">
              <button
                onClick={() => setActiveTab('sending')}
                className={`w-full text-left px-3 py-2 rounded-lg transition ${
                  activeTab === 'sending'
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500'
                    : 'text-white hover:bg-neutral-800'
                }`}
              >
                Opțiuni Trimitere
              </button>
              <button
                onClick={() => setActiveTab('scheduled')}
                className={`w-full text-left px-3 py-2 rounded-lg transition ${
                  activeTab === 'scheduled'
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500'
                    : 'text-white hover:bg-neutral-800'
                }`}
              >
                Mesaje Programate
              </button>
            </nav>
          </div>

          {/* Client Selection Filter */}
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
            <h2 className="text-white text-xl font-semibold flex items-center gap-2 mb-4">
              <Send className="w-5 h-5" />
              Selectează Clienți
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-white text-sm font-medium mb-2">Filtru Serviciu</label>
                <select
                  value={serviceFilter}
                  onChange={(e) => setServiceFilter(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="all">Toate serviciile</option>
                  {servicii.map((service) => (
                    <option key={service} value={service}>
                      {service}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-white text-sm font-medium mb-2">Filtru Timp</label>
                <select
                  value={timeFilter}
                  onChange={(e) => setTimeFilter(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                >
                  {TIME_FILTERS.map((filter) => (
                    <option key={filter.value} value={filter.value}>
                      {filter.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={applyFilters}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition"
              >
                Aplică Filtre
              </button>
            </div>
          </div>

          {/* Lead Filter */}
          <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
            <h2 className="text-white text-xl font-semibold flex items-center gap-2 mb-4">
              <Target className="w-5 h-5" />
              Selectează Lead-uri
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-white text-sm font-medium mb-2">Filtru Nișă</label>
                <select
                  value={leadNicheFilter}
                  onChange={(e) => setLeadNicheFilter(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="all">Toate nișele</option>
                  {leadNiches.map((niche) => (
                    <option key={niche} value={niche}>
                      {niche}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-white text-sm font-medium mb-2">Filtru Scor (calitate site)</label>
                <select
                  value={leadScoreFilter}
                  onChange={(e) => setLeadScoreFilter(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                >
                  <option value="all">Toate scorurile</option>
                  <option value="low">Scor scăzut (&lt;40) — oportunitate mare</option>
                  <option value="medium">Scor mediu (40-70)</option>
                  <option value="high">Scor ridicat (&gt;70)</option>
                </select>
              </div>
              <p className="text-xs text-neutral-500">
                {channel === 'sms' || channel === 'whatsapp'
                  ? 'Se afișează doar lead-urile cu telefon completat.'
                  : 'Se afișează doar lead-urile cu email completat.'}
              </p>
            </div>
          </div>
        </div>

        {/* Right Main Area */}
        <div className="flex-1">
          {activeTab === 'sending' ? (
            isEditing ? (
              /* Template Creation/Editing */
              <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
                <h2 className="text-white text-xl font-semibold mb-4">
                  {selectedTemplate && !selectedTemplate.is_default ? 'Editează Șablon' : 'Creează Șablon Nou'}
                </h2>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="title" className="block text-white text-sm font-medium mb-2">
                      Titlu / Subiect Email
                    </label>
                    <input
                      id="title"
                      type="text"
                      value={templateForm.title}
                      onChange={(e) => setTemplateForm({...templateForm, title: e.target.value})}
                      placeholder="ex: Follow-up după consultație"
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white placeholder-neutral-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="service" className="block text-white text-sm font-medium mb-2">Serviciu (opțional)</label>
                    <select
                      value={templateForm.service}
                      onChange={(e) => setTemplateForm({...templateForm, service: e.target.value})}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                    >
                      <option value="">Toate serviciile</option>
                      {servicii.map((service) => (
                        <option key={service} value={service}>
                          {service}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="content" className="block text-white text-sm font-medium mb-2">Conținut (HTML)</label>
                    <textarea
                      id="content"
                      value={templateForm.content}
                      onChange={(e) => setTemplateForm({...templateForm, content: e.target.value})}
                      rows={10}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                      placeholder="Folosește {{name}} pentru numele clientului"
                    />
                  </div>
                  <button
                    onClick={handleSaveTemplate}
                    disabled={sending}
                    className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50"
                  >
                    {sending ? 'Se salvează...' : 'Salvează Șablon'}
                  </button>
                </div>
              </div>
            ) : (
              /* Client List and Send Options */
              <div className="space-y-4">
                <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
                  <h2 className="text-white text-xl font-semibold mb-4 flex items-center justify-between">
                    <span>Lista Clienți ({clients.length})</span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setIsAddClientModalOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium rounded-lg transition"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Client
                      </button>
                      <div className="flex items-center space-x-2">
                        <span className="text-white text-sm">Selectați toți</span>
                        <input
                          type="checkbox"
                          checked={selectedClients.length === clients.length && clients.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedClients(clients.map(c => c.email));
                            } else {
                              setSelectedClients([]);
                            }
                          }}
                          className="w-4 h-4"
                        />
                      </div>
                    </div>
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                    {clients.map((client) => (
                      <div key={client.email} className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
                        <div className="flex items-center space-x-3">
                          <input
                            type="checkbox"
                            checked={selectedClients.includes(client.email)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedClients([...selectedClients, client.email]);
                              } else {
                                setSelectedClients(selectedClients.filter(email => email !== client.email));
                              }
                            }}
                            className="w-4 h-4"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">
                              {client.name || 'Fără nume'}
                            </p>
                            <p className="text-gray-400 text-xs truncate">{client.email}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-white text-sm mt-4">
                    Selectați: {selectedClients.length} clienți
                  </div>
                </div>

                <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
                  <h2 className="text-white text-xl font-semibold mb-1 flex items-center justify-between">
                    <span>Lista Lead-uri ({nicheFilteredLeads.length})</span>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setIsAddClientModalOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-medium rounded-lg transition"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Client
                      </button>
                      {channel !== 'whatsapp' && (
                        <div className="flex items-center space-x-2">
                          <span className="text-white text-sm">Selectați toți</span>
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.length === selectableLeads.length && selectableLeads.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedLeadIds(selectableLeads.map(l => l.id));
                              } else {
                                setSelectedLeadIds([]);
                              }
                            }}
                            className="w-4 h-4"
                          />
                        </div>
                      )}
                    </div>
                  </h2>
                  <p className="text-xs text-neutral-500 mb-4">
                    {channel === 'whatsapp'
                      ? `${selectableLeads.length} din ${nicheFilteredLeads.length} au telefon completat — apasă pe iconița WhatsApp pentru a deschide conversația.`
                      : `${selectableLeads.length} din ${nicheFilteredLeads.length} au ${channel === 'sms' ? 'telefon' : 'email'} completat și pot fi selectate.`}
                  </p>
                  {nicheFilteredLeads.length === 0 ? (
                    <p className="text-gray-400 text-sm">Niciun lead pentru filtrul curent.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                      {nicheFilteredLeads.map((lead) => {
                        const contactable = hasContact(lead);
                        const contactValue = channel === 'sms' || channel === 'whatsapp' ? lead.contact_phone : lead.contact_email;
                        return (
                          <div
                            key={lead.id}
                            className={`bg-neutral-800 border border-neutral-700 rounded-lg p-4 ${!contactable ? 'opacity-50' : ''}`}
                          >
                            <div className="flex items-center space-x-3">
                              {channel === 'whatsapp' ? (
                                <button
                                  disabled={!contactable}
                                  title={!contactable ? 'Fără telefon completat' : 'Deschide WhatsApp'}
                                  onClick={() =>
                                    window.open(
                                      formatWhatsAppLink(
                                        lead.contact_phone!,
                                        lead.pitch_generated ??
                                          (selectedTemplate?.content.replace(/\{\{name\}\}/g, lead.company_name) ?? '')
                                      ),
                                      '_blank'
                                    )
                                  }
                                  className="shrink-0 disabled:opacity-30 disabled:cursor-not-allowed text-emerald-400 hover:text-emerald-300"
                                >
                                  <MessageCircle className="w-4 h-4" />
                                </button>
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={selectedLeadIds.includes(lead.id)}
                                  disabled={!contactable}
                                  title={!contactable ? `Fără ${channel === 'sms' ? 'telefon' : 'email'} completat` : undefined}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedLeadIds([...selectedLeadIds, lead.id]);
                                    } else {
                                      setSelectedLeadIds(selectedLeadIds.filter(id => id !== lead.id));
                                    }
                                  }}
                                  className="w-4 h-4 disabled:cursor-not-allowed"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-white text-sm font-medium truncate">
                                    {lead.company_name}
                                  </p>
                                  {lead.score !== null && (
                                    <span
                                      className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
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
                                </div>
                                <p className={`text-xs truncate ${contactable ? 'text-gray-400' : 'text-neutral-600 italic'}`}>
                                  {contactValue ?? `fără ${channel === 'sms' || channel === 'whatsapp' ? 'telefon' : 'email'}`}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {channel !== 'whatsapp' && (
                    <div className="text-white text-sm mt-4">
                      Selectați: {selectedLeadIds.length} lead-uri
                    </div>
                  )}
                </div>

                {/* Send Options */}
                <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
                  <h2 className="text-white text-xl font-semibold mb-4">Opțiuni Trimitere</h2>
                  <div className="space-y-4">
                    {/* Channel selector */}
                    <div>
                      <label className="block text-white text-sm font-medium mb-2">Canal de trimitere</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setChannel('email')}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-sm font-medium transition ${
                            channel === 'email'
                              ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                              : 'bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700'
                          }`}
                        >
                          <Mail className="w-4 h-4" /> Email
                        </button>
                        <button
                          onClick={() => setChannel('sms')}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-sm font-medium transition ${
                            channel === 'sms'
                              ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                              : 'bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700'
                          }`}
                        >
                          <Smartphone className="w-4 h-4" /> SMS
                        </button>
                        <button
                          onClick={() => setChannel('whatsapp')}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-sm font-medium transition ${
                            channel === 'whatsapp'
                              ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                              : 'bg-neutral-800 border-neutral-700 text-white hover:bg-neutral-700'
                          }`}
                        >
                          <MessageCircle className="w-4 h-4" /> WhatsApp
                        </button>
                      </div>
                      {channel === 'sms' && (
                        <p className="text-xs text-amber-400 mt-2">
                          SMS necesită configurare Twilio în .env (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)
                        </p>
                      )}
                      {channel === 'whatsapp' && (
                        <p className="text-xs text-amber-400 mt-2">
                          WhatsApp se trimite manual, de pe numărul tău personal — deschide câte o filă per lead din lista de mai sus.
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-white text-sm font-medium mb-2">Șabloane</label>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {templates.map((template) => (
                          <div
                            key={template.id}
                            className={`p-3 rounded-lg border cursor-pointer transition ${
                              selectedTemplate?.id === template.id
                                ? 'bg-orange-500/20 border-orange-500'
                                : 'bg-neutral-800 border-neutral-700 hover:bg-neutral-700'
                            }`}
                            onClick={() => handleTemplateSelect(template)}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="text-white font-medium">{template.title}</h4>
                                <p className="text-gray-400 text-sm">{template.service || 'Toate serviciile'}</p>
                              </div>
                              {!template.is_default && (
                                <div className="flex gap-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditTemplate(template);
                                    }}
                                    className="text-gray-400 hover:text-white p-1"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteTemplate(template);
                                    }}
                                    className="text-gray-400 hover:text-white p-1"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setSelectedTemplate(null);
                          setTemplateForm({ title: '', content: DEFAULT_TEMPLATE_CONTENT, service: '' });
                          setIsEditing(true);
                        }}
                        className="flex-1 bg-neutral-700 hover:bg-neutral-600 text-white font-medium py-2 px-4 rounded-lg transition"
                      >
                        Creează Șablon Nou
                      </button>
                    </div>

                    {channel !== 'whatsapp' && (
                      <>
                        <div className="space-y-2">
                          <label className="block text-white text-sm font-medium mb-2">Programează pentru mai târziu</label>
                          <input
                            type="datetime-local"
                            value={scheduledAt}
                            onChange={(e) => setScheduledAt(e.target.value)}
                            className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                          />
                        </div>

                        <div className="space-y-2">
                          <button
                            onClick={() => handleSendMessage(true)}
                            disabled={
                              !selectedTemplate ||
                              (selectedClients.length === 0 && selectedLeadIds.length === 0 && serviceFilter === 'all') ||
                              sending
                            }
                            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            <Send className="w-4 h-4" />
                            Trimite Acum
                          </button>

                          <button
                            onClick={() => handleSendMessage(false)}
                            disabled={!selectedTemplate || selectedClients.length === 0 || !scheduledAt || sending}
                            title="Programarea suportă doar clienți deocamdată, nu și lead-uri"
                            className="w-full bg-neutral-700 hover:bg-neutral-600 text-white font-medium py-2 px-4 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            <Clock className="w-4 h-4" />
                            Programează
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          ) : (
            /* Scheduled Messages */
            <div className="bg-neutral-900 rounded-lg border border-neutral-800 p-6">
              <h2 className="text-white text-xl font-semibold flex items-center gap-2 mb-4">
                <Calendar className="w-5 h-5" />
                Mesaje Programate
              </h2>
              {scheduledMessages.length === 0 ? (
                <p className="text-gray-400 text-sm">Niciun mesaj programat</p>
              ) : (
                <div className="space-y-2">
                  {scheduledMessages.map((msg) => (
                    <div key={msg.id} className="p-3 bg-neutral-800 rounded border border-neutral-700">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-white font-medium">{msg.template_title}</h4>
                          <p className="text-gray-400 text-sm">
                            {new Date(msg.scheduled_at).toLocaleString('ro-RO')}
                          </p>
                        </div>
                        <button
                          onClick={() => handleCancelScheduled(msg.id)}
                          className="text-gray-400 hover:text-white p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <AddClientModal
        isOpen={isAddClientModalOpen}
        onClose={() => setIsAddClientModalOpen(false)}
        onCreated={() => { fetchClients(); fetchLeads(); }}
      />
    </div>
  );
}