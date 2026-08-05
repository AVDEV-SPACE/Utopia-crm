// components/AddClientModal.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';
import { sendBookingEmails } from '@/actions/send-emails';

interface Service { id: string; name: string; duration: number; price: number; icon: string; category: string; }
interface Toast { id: number; message: string; type: 'success' | 'error'; fading?: boolean; }

interface DaySchedule {
  day: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
}

interface AddClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Chemat după ce un booking sau un lead a fost creat cu succes. */
  onCreated?: () => void;
}

export default function AddClientModal({ isOpen, onClose, onCreated }: AddClientModalProps) {
  let toastIdCounter = 0;

  const [formData, setFormData] = useState({
    name: '', phone: '', email: '',
    serviceId: '', serviceName: '',
    date: '', time: '',
  });

  const [activeCategory,     setActiveCategory]     = useState('all');
  const [categories,         setCategories]         = useState<string[]>(['all']);
  const [selectedService,    setSelectedService]    = useState<Service | null>(null);
  const [availableTimeSlots, setAvailableTimeSlots] = useState<string[]>([]);
  const [bookedTimes,        setBookedTimes]        = useState<string[]>([]);
  const [loadingTimes,       setLoadingTimes]       = useState(false);
  const [schedule,           setSchedule]           = useState<DaySchedule[]>([]);
  const [loadingSchedule,    setLoadingSchedule]    = useState(false);
  const [isLoading,          setIsLoading]          = useState(false);
  const [toasts,             setToasts]             = useState<Toast[]>([]);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const services = [
    { id: '1', name: 'Consultație gratuită', duration: 30, price: 0, icon: '💬', category: 'Consultații' },
    { id: '2', name: 'Dezvoltare Web',        duration: 60, price: 0, icon: '🌐', category: 'Web & IT' },
    { id: '3', name: 'Consultanță IT',        duration: 60, price: 0, icon: '🖥️', category: 'Consultații' },
    { id: '4', name: 'Automatizări',          duration: 60, price: 0, icon: '⚙️', category: 'Web & IT' },
    { id: '5', name: 'E-commerce',            duration: 60, price: 0, icon: '🛒', category: 'Web & IT' },
    { id: '6', name: 'Mentenanță',            duration: 30, price: 0, icon: '🔧', category: 'Web & IT' },
  ];

  const filteredServices = activeCategory === 'all'
    ? services
    : services.filter(s => s.category === activeCategory);

  useEffect(() => {
    if (formData.serviceId) {
      const svc = services.find(s => s.id === formData.serviceId);
      setSelectedService(svc ?? null);
    } else { setSelectedService(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.serviceId]);

  useEffect(() => {
    const uniqueCategories = [...new Set(services.map(s => s.category))];
    setCategories(['all', ...uniqueCategories]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fetchSchedule = async () => {
      setLoadingSchedule(true);
      try {
        // Simplified schedule fetch - using static schedule for demo
        const loaded: DaySchedule[] = [0, 1, 2, 3, 4, 5, 6].map(day => ({
          day,
          enabled: day !== 0 && day !== 6,
          startTime: '09:00',
          endTime: '18:00',
        }));
        setSchedule(loaded);
      } catch (err) { console.error('Error loading schedule:', err); }
      finally { setLoadingSchedule(false); }
    };
    fetchSchedule();
  }, []);

  const addToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, fading: true } : t));
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300);
    }, 4500);
  };
  const removeToast = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  const generateAvailableTimeSlots = useCallback((date: string, booked: string[], blocked: string[]) => {
    if (!date) return [];
    const day = new Date(date).getDay();
    const daySchedule = schedule.find(s => s.day === day);
    if (!daySchedule || !daySchedule.enabled) return [];
    const slots: string[] = [];
    let [h, m] = daySchedule.startTime.split(':').map(Number);
    const [endH, endM] = daySchedule.endTime.split(':').map(Number);
    while (h < endH || (h === endH && m < endM)) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      m += 30; if (m >= 60) { m = 0; h++; }
    }
    let filteredSlots = slots.filter(s => !booked.includes(s) && !blocked.includes(s));
    const today = new Date();
    const selectedDate = new Date(date);
    const isToday = today.getFullYear() === selectedDate.getFullYear() &&
                    today.getMonth() === selectedDate.getMonth() &&
                    today.getDate() === selectedDate.getDate();
    if (isToday) {
      const currentTime = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}`;
      filteredSlots = filteredSlots.filter(s => s > currentTime);
    }
    return filteredSlots;
  }, [schedule]);

  useEffect(() => {
    if (!formData.date || loadingSchedule) { setBookedTimes([]); setAvailableTimeSlots([]); setLoadingTimes(false); return; }
    setLoadingTimes(true);
    (async () => {
      try {
        const response = await fetch(`/api/bookings?date=${formData.date}`);
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        const times = (data || [])
          .map((r: { time: string | null }) => { const m2 = r.time?.toString().match(/^(\d{1,2}):(\d{2})/); return m2 ? `${m2[1].padStart(2, '0')}:${m2[2]}` : ''; })
          .filter(Boolean).filter((t: string, i: number, s: string[]) => s.indexOf(t) === i);
        setBookedTimes(times);
        setAvailableTimeSlots(generateAvailableTimeSlots(formData.date, times, []));
      } catch { setBookedTimes([]); setAvailableTimeSlots([]); addToast('Eroare la încărcarea orelor', 'error'); }
      finally { setLoadingTimes(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.date, generateAvailableTimeSlots, loadingSchedule]);

  const handleInputChange   = (e: React.ChangeEvent<HTMLInputElement>) => setFormData(p => ({ ...p, [e.target.name]: e.target.value }));
  const handleDateChange    = (e: React.ChangeEvent<HTMLInputElement>) => { setFormData(p => ({ ...p, date: e.target.value, time: '' })); setAvailableTimeSlots([]); setBookedTimes([]); };
  const handleServiceSelect = (svc: Service) => setFormData(p =>
    p.serviceId === svc.id
      ? { ...p, serviceId: '', serviceName: '' }
      : { ...p, serviceId: svc.id, serviceName: svc.name }
  );
  const resetForm = () => { setFormData({ name: '', phone: '', email: '', serviceId: '', serviceName: '', date: '', time: '' }); setActiveCategory('all'); setAvailableTimeSlots([]); setBookedTimes([]); };
  const handleCloseModal = () => { onClose(); resetForm(); };

  // Fără dată+oră completate => nu e o programare, ci un lead/potențial client
  // (bookings.meeting_date/meeting_time sunt NOT NULL în DB, deci nu poate deveni booking fără ele).
  const isBookingIntent = Boolean(formData.date || formData.time);
  const isBookingValid  = Boolean(formData.date && formData.time && formData.serviceId);
  const isLeadValid     = !isBookingIntent && Boolean(formData.email || formData.phone);
  const canSubmit        = Boolean(formData.name) && (isBookingIntent ? isBookingValid : isLeadValid);

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true);
    try {
      if (isBookingIntent) {
        if (!availableTimeSlots.includes(formData.time)) { addToast('Slotul nu mai este disponibil.', 'error'); return; }
        const response = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name, phone: formData.phone, email: formData.email,
            service: formData.serviceName, date: formData.date, time: formData.time + ':00',
            created_at: new Date().toISOString(),
          }),
        });
        if (!response.ok) throw new Error('Failed to create booking');
        addToast('Programare adăugată cu succes!');
        const emailResult = await sendBookingEmails({ name: formData.name, email: formData.email, phone: formData.phone, service: formData.serviceName, date: formData.date, time: formData.time });
        if (!emailResult.success) addToast('Email confirmare nu a fost trimis', 'error');
        const reviewTime = new Date(new Date(`${formData.date}T${formData.time}:00`).getTime() + 2 * 60 * 60 * 1000);
        await fetch('/api/pending-reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email, name: formData.name, service: formData.serviceName, appointment_date: formData.date, review_email_scheduled_for: reviewTime.toISOString(), sent: false, created_at: new Date().toISOString() }),
        });
      } else {
        const response = await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_name: formData.name,
            contact_email: formData.email || null,
            contact_phone: formData.phone || null,
            niche: formData.serviceName || null,
          }),
        });
        if (!response.ok) throw new Error('Failed to create lead');
        addToast('Lead adăugat cu succes!');
      }
      onCreated?.();
      handleCloseModal();
    } catch { addToast('Eroare la adăugare.', 'error'); }
    finally { setIsLoading(false); }
  };

  const getDayName = (d: string) => ['Duminica', 'Luni', 'Marti', 'Miercuri', 'Joi', 'Vineri', 'Sambata'][new Date(d).getDay()] ?? '';

  return (
    <>
      {/* ── TOASTS ──────────────────────────────────────────────────────── */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} onClick={() => removeToast(t.id)}
            className={`flex items-center gap-3 px-4 py-3 min-w-[260px] max-w-xs border rounded-xl shadow-2xl pointer-events-auto cursor-pointer select-none transition-all text-sm ${t.fading ? 'opacity-0 translate-y-1' : 'opacity-100'} ${t.type === 'error' ? 'bg-stone-950 border-red-500/30 text-red-400' : 'bg-stone-950 border-stone-700/50 text-stone-300'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${t.type === 'error' ? 'bg-red-500/15' : 'bg-amber-500/15'}`}>
              {t.type === 'error' ? <X className="w-3.5 h-3.5 text-red-400" /> : <Check className="w-3.5 h-3.5 text-amber-400" />}
            </div>
            <span className="flex-1">{t.message}</span>
            <button onClick={e => { e.stopPropagation(); removeToast(t.id); }} className="text-stone-700 hover:text-stone-400 ml-1"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>

      {/* ── ADD CLIENT MODAL BACKDROP ───────────────────────────────────── */}
      {isOpen && <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-40" onClick={handleCloseModal} />}

      {/* ── ADD CLIENT MODAL ────────────────────────────────────────────── */}
      {isOpen && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
          <div className="bg-stone-950 border border-stone-700/50 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">

            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800/60 flex-shrink-0 bg-stone-950 rounded-t-2xl">
              <div>
                <p className="text-[10px] text-orange-400/60 uppercase tracking-[0.18em] mb-0.5">
                  Utopia CRM
                </p>
                <h2 className="text-base font-light text-white">{isBookingIntent ? 'Booking nou' : 'Client / Lead nou'}</h2>
              </div>
              <button onClick={handleCloseModal} className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-600 hover:text-white hover:bg-stone-800 transition">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 modal-scroll">
              <form onSubmit={handleAddClient} className="p-6 space-y-6">
                <div className="space-y-4">
                  <p className="text-[10px] text-stone-600 uppercase tracking-[0.18em]">Detalii client</p>
                  <div>
                    <label className="block text-xs text-stone-500 mb-1.5">Nume complet</label>
                    <input type="text" name="name" value={formData.name} onChange={handleInputChange} required placeholder="Ion Popescu"
                      className="w-full px-3 py-2.5 bg-stone-900/60 text-white border border-stone-700/50 rounded-xl focus:outline-none focus:border-amber-500/40 transition text-sm placeholder-stone-700" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-stone-500 mb-1.5">Telefon</label>
                      <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} pattern="07[0-9]{8}" placeholder="07xxxxxxxx"
                        className="w-full px-3 py-2.5 bg-stone-900/60 text-white border border-stone-700/50 rounded-xl focus:outline-none focus:border-amber-500/40 transition text-sm placeholder-stone-700 font-mono" />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-500 mb-1.5">Email</label>
                      <input type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="ion@email.com"
                        className="w-full px-3 py-2.5 bg-stone-900/60 text-white border border-stone-700/50 rounded-xl focus:outline-none focus:border-amber-500/40 transition text-sm placeholder-stone-700" />
                    </div>
                  </div>
                  {!isBookingIntent && (
                    <p className="text-[11px] text-stone-600">Completează cel puțin telefon sau email pentru a putea fi contactat/ă.</p>
                  )}
                </div>

                <div className="border-t border-stone-800/60" />

                <div className="space-y-3">
                  <p className="text-[10px] text-stone-600 uppercase tracking-[0.18em]">Serviciu / Nișă {!isBookingIntent && <span className="normal-case text-stone-700">(opțional)</span>}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {categories.map(cat => (
                      <button key={cat} type="button" onClick={() => setActiveCategory(cat)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${activeCategory === cat ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-stone-900/60 text-stone-600 border border-stone-800/60 hover:border-stone-700 hover:text-stone-400'}`}>
                        {cat === 'all' ? 'Toate' : cat}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {filteredServices.map(svc => {
                      const isSel = formData.serviceId === svc.id;
                      return (
                        <button key={svc.id} type="button" onClick={() => handleServiceSelect(svc)}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all group ${isSel ? 'bg-amber-500/10 border-amber-500/30' : 'bg-stone-900/40 border-stone-800/50 hover:border-stone-700'}`}>
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-sm ${isSel ? 'bg-amber-500/20 text-amber-400' : 'bg-stone-800/60 text-stone-500 group-hover:bg-stone-800'}`}>{svc.icon}</div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium leading-tight ${isSel ? 'text-white' : 'text-stone-300'}`}>{svc.name}</p>
                            <p className="text-[11px] text-stone-600 mt-0.5">{svc.category} · {svc.duration} min</p>
                          </div>
                          <p className={`text-sm font-semibold flex-shrink-0 ${isSel ? 'text-amber-400' : 'text-stone-500'}`}>{svc.price} lei</p>
                          {isSel && <div className="w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0"><Check className="w-2.5 h-2.5 text-black" /></div>}
                        </button>
                      );
                    })}
                  </div>
                  {selectedService && (
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                      <span className="text-amber-400 text-sm">{selectedService.icon}</span>
                      <span className="text-xs text-stone-400 flex-1">{selectedService.name}</span>
                      <span className="text-xs text-amber-400 font-medium">{selectedService.price} lei · {selectedService.duration} min</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-stone-800/60" />

                <div className="space-y-4">
                  <p className="text-[10px] text-stone-600 uppercase tracking-[0.18em]">Data & Ora <span className="normal-case text-stone-700">(opțional — lasă gol pentru a adăuga ca lead, fără programare)</span></p>
                  <div>
                    <label className="block text-xs text-stone-500 mb-1.5">Data programarii</label>
                    <div onClick={() => dateInputRef.current?.showPicker?.()} className="cursor-pointer">
                      <input ref={dateInputRef} type="date" value={formData.date} onChange={handleDateChange}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full px-3 py-2.5 bg-stone-900/60 text-white border border-stone-700/50 rounded-xl focus:outline-none focus:border-amber-500/40 transition text-sm cursor-pointer"
                        style={{ colorScheme: 'dark' }} />
                    </div>
                  </div>
                  {isBookingIntent && (
                    <div>
                      <label className="block text-xs text-stone-500 mb-2">Ora</label>
                      {!formData.date ? (
                        <div className="px-4 py-3 bg-stone-900/40 border border-stone-800/50 rounded-xl text-stone-700 text-xs text-center">Selecteaza mai intai data</div>
                      ) : loadingTimes ? (
                        <div className="flex items-center justify-center gap-2 px-4 py-3 bg-stone-900/40 border border-stone-800/50 rounded-xl text-stone-600 text-xs">
                          <div className="w-3 h-3 border border-stone-700 border-t-amber-500 rounded-full animate-spin" /> Se incarca...
                        </div>
                      ) : availableTimeSlots.length === 0 ? (
                        <div className="px-4 py-3 bg-stone-900/40 border border-stone-800/50 rounded-xl text-stone-600 text-xs text-center">Toate sloturile sunt ocupate — {getDayName(formData.date)}</div>
                      ) : (
                        <>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-stone-600">{getDayName(formData.date)} · <span className="text-emerald-400">{availableTimeSlots.length} libere</span></span>
                            <span className="text-xs text-stone-700">{bookedTimes.length} ocupate</span>
                          </div>
                          <div className="grid grid-cols-5 gap-1.5">
                            {availableTimeSlots.map(slot => (
                              <button key={slot} type="button" onClick={() => setFormData(p => ({ ...p, time: slot }))}
                                className={`py-2 rounded-lg text-xs font-medium transition-all ${formData.time === slot ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20 font-semibold' : 'bg-stone-900/60 text-stone-500 border border-stone-800/60 hover:border-amber-500/30 hover:text-stone-300'}`}>
                                {slot}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={handleCloseModal}
                    className="flex-1 px-4 py-2.5 bg-stone-900/60 hover:bg-stone-800 text-stone-500 rounded-xl font-medium transition border border-stone-800/60 text-sm">
                    Anulare
                  </button>
                  <button type="submit" disabled={isLoading || !canSubmit}
                    className="flex-1 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black rounded-xl font-semibold transition shadow-md shadow-amber-500/20 text-sm active:scale-95">
                    {isLoading
                      ? <span className="flex items-center justify-center gap-2"><div className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" /> Se salveaza...</span>
                      : isBookingIntent ? 'Confirma programarea' : 'Adaugă ca lead'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
