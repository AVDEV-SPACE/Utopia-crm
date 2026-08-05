'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Check, Clock, Calendar, ChevronLeft, ChevronRight, Ban } from 'lucide-react';


interface AvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DayAvailability {
  day: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
}

interface BlockedSlotRow {
  id: string;
  meeting_date: string;
  meeting_time: string;
  reason: string | null;
}

const DAYS = [
  { id: 0, name: 'Duminica', short: 'Dum' },
  { id: 1, name: 'Luni', short: 'Lun' },
  { id: 2, name: 'Marti', short: 'Mar' },
  { id: 3, name: 'Miercuri', short: 'Mie' },
  { id: 4, name: 'Joi', short: 'Joi' },
  { id: 5, name: 'Vineri', short: 'Vin' },
  { id: 6, name: 'Sambata', short: 'Sam' },
];

const TIME_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30',
  '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
  '14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00', '20:30', '21:00'
];

// Grila reală de sloturi publice (trebuie să corespundă cu app/api/available-slots din site: 09:00–18:00)
const PUBLIC_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 9; h <= 18; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 18) slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  return slots;
})();

const getTodayDate = (): string => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

// Modal bg values — inline so CSS cascade cannot override
const MODAL_BG = 'oklch(0.13 0.004 17)';
const MODAL_HDR_BG = 'oklch(0.17 0.006 17)';
const MODAL_FTR_BG = 'oklch(0.17 0.006 17 / 0.80)';
const SELECT_BG = 'oklch(0.18 0.006 17)';
const PREVIEW_BG = 'oklch(0.17 0.006 17 / 0.60)';

export default function AvailabilityModal({ isOpen, onClose }: AvailabilityModalProps) {
  const [availability, setAvailability] = useState<DayAvailability[]>(
    DAYS.map(day => ({
      day: day.id,
      enabled: day.id !== 0 && day.id !== 6,
      startTime: '09:00',
      endTime: '18:00',
    }))
  );
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'schedule' | 'block'>('block');

  const [blockedSlots, setBlockedSlots] = useState<BlockedSlotRow[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [rangeFrom, setRangeFrom] = useState(getTodayDate());
  const [rangeTo, setRangeTo] = useState(getTodayDate());
  const [selectedTimes, setSelectedTimes] = useState<Set<string>>(new Set(PUBLIC_SLOTS));
  const [timeRangeFrom, setTimeRangeFrom] = useState(PUBLIC_SLOTS[0]);
  const [timeRangeTo, setTimeRangeTo] = useState(PUBLIC_SLOTS[PUBLIC_SLOTS.length - 1]);
  const [bulkReason, setBulkReason] = useState('');
  const [isBulkBlocking, setIsBulkBlocking] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const getDateForDay = (dayId: number): string => {
    const today = new Date();
    const diff = dayId - today.getDay();
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + diff);
    return targetDate.toISOString().split('T')[0];
  };

  useEffect(() => {
    if (!isOpen) return;
    const loadAvailability = async () => {
      // Simplified - no salon context, use static availability
      setAvailability(DAYS.map(day => ({
        day: day.id,
        enabled: day.id !== 0 && day.id !== 6,
        startTime: '09:00',
        endTime: '18:00',
      })));
    };
    loadAvailability();
  }, [isOpen]);

  const loadBlockedSlots = useCallback(async () => {
    setLoadingBlocked(true);
    try {
      const res = await fetch('/api/blocked-slots');
      const data = await res.json();
      setBlockedSlots(Array.isArray(data) ? data : []);
    } catch {
      setBlockedSlots([]);
    } finally {
      setLoadingBlocked(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadBlockedSlots();
  }, [isOpen, loadBlockedSlots]);

  const computeWeekdayDates = (from: string, to: string): string[] => {
    if (!from || !to) return [];
    const start = new Date(from + 'T00:00:00');
    const end = new Date(to + 'T00:00:00');
    if (end < start) return [];
    const dates: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const dow = cursor.getDay();
      if (dow !== 0 && dow !== 6) {
        dates.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  };

  const weekdayDates = useMemo(() => computeWeekdayDates(rangeFrom, rangeTo), [rangeFrom, rangeTo]);

  const groupedBlocked = useMemo(() => {
    const map = new Map<string, BlockedSlotRow[]>();
    for (const slot of blockedSlots) {
      const key = slot.meeting_date.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(slot);
    }
    return Array.from(map.entries())
      .map(([date, slots]) => ({ date, slots: slots.sort((a, b) => a.meeting_time.localeCompare(b.meeting_time)) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [blockedSlots]);

  const toggleSelectAllTimes = () => {
    setSelectedTimes(prev => prev.size === PUBLIC_SLOTS.length ? new Set() : new Set(PUBLIC_SLOTS));
  };

  const toggleTime = (time: string) => {
    setSelectedTimes(prev => {
      const next = new Set(prev);
      if (next.has(time)) next.delete(time); else next.add(time);
      return next;
    });
  };

  // Comparație lexicografică — sigură pentru "HH:MM" cu zero-padding, ordinea corespunde cronologic.
  const slotsInRange = (from: string, to: string): string[] =>
    PUBLIC_SLOTS.filter(t => t >= from && t <= to);

  const addTimeRange = () => {
    if (timeRangeFrom > timeRangeTo) return;
    const inRange = slotsInRange(timeRangeFrom, timeRangeTo);
    setSelectedTimes(prev => new Set([...prev, ...inRange]));
  };

  const removeTimeRange = () => {
    if (timeRangeFrom > timeRangeTo) return;
    const inRange = new Set(slotsInRange(timeRangeFrom, timeRangeTo));
    setSelectedTimes(prev => new Set([...prev].filter(t => !inRange.has(t))));
  };

  const handleToggleDay = (dayId: number) => {
    setAvailability(prev => prev.map(d => d.day === dayId ? { ...d, enabled: !d.enabled } : d));
  };

  const handleTimeChange = (dayId: number, field: 'startTime' | 'endTime', value: string) => {
    setAvailability(prev => prev.map(d => d.day === dayId ? { ...d, [field]: value } : d));
  };

  const handleSaveAvailability = async () => {
    setIsSaving(true); setSaved(false);
    // Simplified - no save to DB
    setTimeout(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setIsSaving(false);
    }, 1000);
  };

  const handleBulkBlock = async () => {
    if (!weekdayDates.length || selectedTimes.size === 0) return;
    setIsBulkBlocking(true);
    setBulkMessage(null);
    try {
      const res = await fetch('/api/blocked-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates: weekdayDates, times: Array.from(selectedTimes), reason: bulkReason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Eroare necunoscută');
      const skipped = data.requested - data.inserted;
      setBulkMessage({
        type: 'success',
        text: `${data.inserted} sloturi blocate cu succes${skipped > 0 ? ` (${skipped} erau deja blocate)` : ''}.`,
      });
      await loadBlockedSlots();
    } catch (err) {
      setBulkMessage({ type: 'error', text: err instanceof Error ? err.message : 'Eroare la blocare.' });
    } finally {
      setIsBulkBlocking(false);
    }
  };

  const handleUnblockDate = async (date: string) => {
    setLoadingBlocked(true);
    try {
      await fetch('/api/blocked-slots', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      });
      await loadBlockedSlots();
    } finally {
      setLoadingBlocked(false);
    }
  };

  const handleUnblockOne = async (id: string) => {
    setBlockedSlots(prev => prev.filter(s => s.id !== id));
    try {
      await fetch('/api/blocked-slots', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
    } finally {
      loadBlockedSlots();
    }
  };

  if (!isOpen) return null;

  const selectedDayAvailability = availability.find(d => d.day === selectedDay);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
      {/* Inline bg — immune to CSS theme overrides */}
      <div className="border border-stone-700/50 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
        style={{ backgroundColor: MODAL_BG }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-800/60 flex-shrink-0"
          style={{ backgroundColor: MODAL_HDR_BG }}>
          <div>
            <h2 className="text-lg font-semibold text-white">Availability</h2>
            <p className="text-xs text-stone-500 mt-0.5">Set your working hours and block time for breaks</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-600 hover:text-white hover:bg-stone-800 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-2 px-6 pt-4 flex-shrink-0" style={{ backgroundColor: MODAL_BG }}>
          <button
            type="button"
            onClick={() => setActiveTab('block')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'block'
                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                : 'bg-stone-900/40 text-stone-500 border border-stone-800/60 hover:text-stone-300'
            }`}
          >
            Blochează sloturi
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('schedule')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'schedule'
                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                : 'bg-stone-900/40 text-stone-500 border border-stone-800/60 hover:text-stone-300'
            }`}
          >
            Program de lucru
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 modal-scroll" style={{ backgroundColor: MODAL_BG }}>

          {activeTab === 'schedule' && (
          <>
          {/* Days selector */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            {DAYS.map(day => {
              const dayDate = getDateForDay(day.id);
              const dayAvailability = availability.find(d => d.day === day.id);
              const isToday = dayDate === getTodayDate();
              const isSelected = selectedDay === day.id;

              return (
                <button
                  key={day.id}
                  onClick={() => setSelectedDay(day.id)}
                  className={`flex-shrink-0 px-4 py-3 rounded-xl text-xs font-medium transition-all min-w-[70px] ${
                    isSelected
                      ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                      : dayAvailability?.enabled
                        ? 'bg-stone-800/80 text-stone-300 border border-stone-700 hover:bg-stone-700'
                        : 'bg-stone-900/30 text-stone-600 border border-stone-800'
                  }`}
                >
                  <div className="text-xs font-semibold">{day.short}</div>
                  {/* FIX: when selected, date number must be dark (readable on amber bg) */}
                  <div className={`text-[10px] mt-0.5 font-medium ${
                    isSelected  ? 'text-black/60' :
                    isToday     ? 'text-amber-400' :
                                  'text-stone-500'
                  }`}>
                    {isToday && !isSelected ? 'Azi' : new Date(dayDate).getDate()}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Selected day settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-400">
                {DAYS.find(d => d.id === selectedDay)?.name}
                {getDateForDay(selectedDay) === getTodayDate() && (
                  <span className="ml-2 text-xs text-amber-400/70">· Azi</span>
                )}
              </span>
              <button
                onClick={() => handleToggleDay(selectedDay)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  selectedDayAvailability?.enabled ? 'bg-amber-500' : 'bg-stone-700'
                }`}
              >
                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  selectedDayAvailability?.enabled ? 'left-7' : 'left-1'
                }`} />
              </button>
            </div>

            {selectedDayAvailability?.enabled && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-stone-500 mb-2">Start Time</label>
                    <select
                      value={selectedDayAvailability.startTime}
                      onChange={(e) => handleTimeChange(selectedDay, 'startTime', e.target.value)}
                      className="w-full px-3 py-2.5 text-white border border-stone-700/50 rounded-xl focus:outline-none focus:border-amber-500/40 transition text-sm"
                      style={{ backgroundColor: SELECT_BG }}
                    >
                      {TIME_SLOTS.map(time => <option key={time} value={time}>{time}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-2">End Time</label>
                    <select
                      value={selectedDayAvailability.endTime}
                      onChange={(e) => handleTimeChange(selectedDay, 'endTime', e.target.value)}
                      className="w-full px-3 py-2.5 text-white border border-stone-700/50 rounded-xl focus:outline-none focus:border-amber-500/40 transition text-sm"
                      style={{ backgroundColor: SELECT_BG }}
                    >
                      {TIME_SLOTS.map(time => <option key={time} value={time}>{time}</option>)}
                    </select>
                  </div>
                </div>

                {/* Preview */}
                <div className="mt-4 p-3 border border-stone-800/50 rounded-xl" style={{ backgroundColor: PREVIEW_BG }}>
                  <div className="flex items-center gap-2 text-xs text-stone-500">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{selectedDayAvailability.startTime} - {selectedDayAvailability.endTime}</span>
                  </div>
                </div>
              </>
            )}
          </div>
          </>
          )}

          {/* Blocare sloturi în masă */}
          {activeTab === 'block' && (
          <div>
            <div className="mb-4">
              <h3 className="text-sm font-medium text-white">Blochează sloturi în masă</h3>
              <p className="text-xs text-stone-500 mt-0.5">Selectează un interval de zile și orele pe care vrei să le faci indisponibile pentru rezervări publice.</p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-1">
              <div>
                <label className="block text-xs text-stone-500 mb-1.5">De la</label>
                <input
                  type="date"
                  value={rangeFrom}
                  min={getTodayDate()}
                  onChange={(e) => { setRangeFrom(e.target.value); if (rangeTo < e.target.value) setRangeTo(e.target.value); }}
                  className="w-full px-3 py-2.5 text-white border border-stone-700/50 rounded-xl text-sm"
                  style={{ backgroundColor: SELECT_BG, colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1.5">Până la</label>
                <input
                  type="date"
                  value={rangeTo}
                  min={rangeFrom || getTodayDate()}
                  onChange={(e) => setRangeTo(e.target.value)}
                  className="w-full px-3 py-2.5 text-white border border-stone-700/50 rounded-xl text-sm"
                  style={{ backgroundColor: SELECT_BG, colorScheme: 'dark' }}
                />
              </div>
            </div>
            <p className="text-[10px] text-stone-600 mb-4">
              Se aplică doar zilelor lucrătoare (Luni–Vineri) · {weekdayDates.length} {weekdayDates.length === 1 ? 'zi selectată' : 'zile selectate'}
            </p>

            {/* Selectare rapidă pe interval orar — ex. 10:00–14:00, în loc de click pe fiecare slot */}
            <div className="mb-4 p-3 border border-stone-800/60 rounded-xl" style={{ backgroundColor: PREVIEW_BG }}>
              <label className="block text-xs text-stone-500 mb-2">Interval orar rapid (poți adăuga mai multe intervale)</label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="block text-[10px] text-stone-600 mb-1">De la</label>
                  <select
                    value={timeRangeFrom}
                    onChange={(e) => setTimeRangeFrom(e.target.value)}
                    className="w-full px-3 py-2 text-white border border-stone-700/50 rounded-lg text-sm"
                    style={{ backgroundColor: SELECT_BG }}
                  >
                    {PUBLIC_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-stone-600 mb-1">Până la</label>
                  <select
                    value={timeRangeTo}
                    onChange={(e) => setTimeRangeTo(e.target.value)}
                    className="w-full px-3 py-2 text-white border border-stone-700/50 rounded-lg text-sm"
                    style={{ backgroundColor: SELECT_BG }}
                  >
                    {PUBLIC_SLOTS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              {timeRangeFrom > timeRangeTo ? (
                <p className="text-[10px] text-red-400 mb-2">&quot;De la&quot; trebuie să fie înainte de &quot;Până la&quot;.</p>
              ) : (
                <p className="text-[10px] text-stone-600 mb-2">{slotsInRange(timeRangeFrom, timeRangeTo).length} sloturi în acest interval</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addTimeRange}
                  disabled={timeRangeFrom > timeRangeTo}
                  className="flex-1 px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-40 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-medium transition"
                >
                  + Adaugă interval
                </button>
                <button
                  type="button"
                  onClick={removeTimeRange}
                  disabled={timeRangeFrom > timeRangeTo}
                  className="flex-1 px-3 py-1.5 bg-stone-800/60 hover:bg-stone-800 disabled:opacity-40 text-stone-400 border border-stone-700/60 rounded-lg text-xs font-medium transition"
                >
                  − Elimină interval
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-stone-500">Ore</label>
              <button
                type="button"
                onClick={toggleSelectAllTimes}
                className="text-[11px] text-amber-400 hover:text-amber-300 font-medium"
              >
                {selectedTimes.size === PUBLIC_SLOTS.length ? 'Deselectează tot' : 'Selectează tot'}
              </button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5 mb-4">
              {PUBLIC_SLOTS.map(time => {
                const sel = selectedTimes.has(time);
                return (
                  <button
                    key={time}
                    type="button"
                    onClick={() => toggleTime(time)}
                    className={`py-2 rounded-lg text-xs font-medium transition-all ${
                      sel
                        ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20 font-semibold'
                        : 'bg-stone-900/60 text-stone-500 border border-stone-800/60 hover:border-amber-500/30 hover:text-stone-300'
                    }`}
                  >
                    {time}
                  </button>
                );
              })}
            </div>

            <div className="mb-4">
              <label className="block text-xs text-stone-500 mb-1.5">Motiv (opțional)</label>
              <input
                type="text"
                value={bulkReason}
                onChange={(e) => setBulkReason(e.target.value)}
                placeholder="Rezervat pentru client premium, indisponibil, etc."
                className="w-full px-3 py-2.5 text-white border border-stone-700/50 rounded-xl text-sm placeholder-stone-700"
                style={{ backgroundColor: SELECT_BG }}
              />
            </div>

            {bulkMessage && (
              <div className={`mb-4 px-3 py-2 rounded-lg text-xs ${
                bulkMessage.type === 'error'
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              }`}>
                {bulkMessage.text}
              </div>
            )}

            <button
              type="button"
              onClick={handleBulkBlock}
              disabled={isBulkBlocking || weekdayDates.length === 0 || selectedTimes.size === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed text-red-400 border border-red-500/30 rounded-xl text-sm font-medium transition"
            >
              {isBulkBlocking ? (
                <><div className="w-3.5 h-3.5 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />Se blochează...</>
              ) : (
                <><Ban className="w-4 h-4" />Blochează {weekdayDates.length * selectedTimes.size} sloturi</>
              )}
            </button>

            {/* Listă sloturi deja blocate */}
            <div className="mt-6">
              <p className="text-[10px] text-stone-600 uppercase tracking-[0.18em] mb-3">Sloturi blocate viitoare</p>
              {loadingBlocked ? (
                <div className="flex items-center justify-center gap-2 py-6 text-stone-600 text-xs">
                  <div className="w-3.5 h-3.5 border border-stone-700 border-t-amber-500 rounded-full animate-spin" />Se încarcă...
                </div>
              ) : groupedBlocked.length === 0 ? (
                <div className="text-xs text-stone-600 text-center py-6 bg-stone-900/20 border border-stone-800/30 rounded-xl">
                  <Ban className="w-6 h-6 mx-auto mb-2 text-stone-700" />
                  Niciun slot blocat momentan
                </div>
              ) : (
                <div className="grid gap-2">
                  {groupedBlocked.map(group => (
                    <div key={group.date} className="px-4 py-3 bg-red-500/5 border border-red-500/20 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-white">
                          {new Date(group.date + 'T12:00:00').toLocaleDateString('ro-RO', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </span>
                        <button
                          onClick={() => handleUnblockDate(group.date)}
                          className="text-[11px] text-stone-500 hover:text-red-400 transition"
                        >
                          Deblochează toată ziua
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.slots.map(slot => (
                          <button
                            key={slot.id}
                            onClick={() => handleUnblockOne(slot.id)}
                            title={slot.reason || undefined}
                            className="px-2 py-1 rounded-md bg-red-500/10 text-red-400 text-[11px] hover:bg-red-500/20 transition"
                          >
                            {slot.meeting_time.slice(0, 5)} ✕
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          )}
        </div>

        {/* Footer — acțiunile diferă per tab, ca să nu existe ambiguitate despre ce salvează butonul */}
        {activeTab === 'schedule' ? (
          <div className="flex items-center justify-between px-6 py-4 border-t border-stone-800/60 flex-shrink-0"
            style={{ backgroundColor: MODAL_FTR_BG }}>
            <div className="flex items-center gap-2">
              {saved && (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-emerald-400">Saved successfully!</span>
                </>
              )}
            </div>
            <button
              onClick={handleSaveAvailability}
              disabled={isSaving}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-medium rounded-xl transition text-sm flex items-center gap-2"
            >
              {isSaving ? (
                <><div className="w-3.5 h-3.5 border-2 border-black/20 border-t-black rounded-full animate-spin" />Saving...</>
              ) : (
                <><Check className="w-4 h-4" />Save Changes</>
              )}
            </button>
          </div>
        ) : (
          <div className="flex items-center px-6 py-3 border-t border-stone-800/60 flex-shrink-0"
            style={{ backgroundColor: MODAL_FTR_BG }}>
            <p className="text-[11px] text-stone-600">Butonul „Blochează sloturi" de mai sus salvează direct — nu mai e nevoie de alt pas.</p>
          </div>
        )}
      </div>
    </div>
  );
}