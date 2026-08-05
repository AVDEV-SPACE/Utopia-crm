// components/CalendarView.tsx
'use client';

import { useState, useEffect, useRef } from 'react';

interface Props {
  agencyName: string;
  onSelect: (date: string, time: string) => void;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const GREEN_SHADE = '#6da2ff';
const GRAY_SHADE  = '#f3f4f6';

const WEEKDAY_STYLE: React.CSSProperties = {
  fontFamily: "'Inter', system-ui, sans-serif",
  fontWeight: 400,
  fontStyle: 'normal',
  letterSpacing: '-0.04em',
};

const generateSlots = (): string[] => {
  const s: string[] = [];
  for (let h = 9; h <= 20; h++) {
    s.push(`${String(h).padStart(2,'0')}:00`);
    s.push(`${String(h).padStart(2,'0')}:30`);
  }
  return s;
};
const ALL_SLOTS = generateSlots();

const getFutureSlots = (dateStr: string): string[] => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const now = new Date();
  return ALL_SLOTS.filter(s => {
    const [h, min] = s.split(':').map(Number);
    return new Date(y, m - 1, d, h, min) > now;
  });
};

const toDateStr = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

const ChevronLeft = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const ChevronRight = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M6 4L10 8L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function CalendarView({ agencyName, onSelect }: Props) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear]   = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [slots, setSlots]               = useState<string[]>([]);
  const [bookedSlots, setBookedSlots]   = useState<Set<string>>(new Set());
  const [isVerifying, setIsVerifying]   = useState(false);
  const [timeFormat, setTimeFormat]     = useState<'12h'|'24h'>('12h');
  const abortRef = useRef<AbortController|null>(null);

  useEffect(() => {
    let d = new Date(); d.setHours(0,0,0,0);
    for (let i = 0; i < 7; i++) {
      const c = new Date(d); c.setDate(d.getDate() + i);
      if (c.getDay() !== 0 && c.getDay() !== 6) {
        const ds = toDateStr(c);
        setSelectedDate(ds);
        setSlots(getFutureSlots(ds));
        fetchBusy(ds);
        break;
      }
    }
  }, []);

  const fetchBusy = async (dateStr: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setIsVerifying(true);
    try {
      const res  = await fetch(`/api/available-slots?date=${dateStr}`, { signal: ctrl.signal });
      const data = await res.json();
      if (data.success && data.busySlots) {
        const nb = new Set<string>(data.busySlots.map((t: string) => `${dateStr}_${t}`));
        setBookedSlots(prev => { const m = new Set(prev); nb.forEach(k => m.add(k)); return m; });
        setSlots(prev => prev.filter(s => !nb.has(`${dateStr}_${s}`)));
      }
    } catch(e: any) { if (e.name !== 'AbortError') console.error(e); }
    finally { setIsVerifying(false); }
  };

  const fmt = (t: string) => {
    if (timeFormat === '24h') return t;
    const [h, m] = t.split(':').map(Number);
    return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
  };

  const canSelect = (day: number) => {
    const d = new Date(currentYear, currentMonth, day);
    const t = new Date(); t.setHours(0,0,0,0);
    return d >= t && d.getDay() !== 0 && d.getDay() !== 6;
  };

  const isToday = (day: number) =>
    new Date(currentYear, currentMonth, day).toDateString() === today.toDateString();

  const handleDate = (day: number) => {
    const ds = toDateStr(new Date(currentYear, currentMonth, day));
    setSelectedDate(ds); setSelectedTime('');
    setSlots(getFutureSlots(ds).filter(s => !bookedSlots.has(`${ds}_${s}`)));
    fetchBusy(ds);
  };

  const handleTime = (time: string) => {
    if (bookedSlots.has(`${selectedDate}_${time}`)) return;
    setSelectedTime(time);
    onSelect(selectedDate, time);
  };

  const nextAvail = (() => {
    const dates: string[] = [];
    const start = selectedDate ? new Date(selectedDate) : new Date();
    start.setHours(0,0,0,0);
    for (let i = 1; i <= 30 && dates.length < 4; i++) {
      const c = new Date(start); c.setDate(start.getDate() + i);
      if (c.getDay() !== 0 && c.getDay() !== 6) {
        const ds = toDateStr(c);
        if (getFutureSlots(ds).filter(s => !bookedSlots.has(`${ds}_${s}`)).length) dates.push(ds);
      }
    }
    return dates;
  })();

  const daysInMonth = new Date(currentYear, currentMonth+1, 0).getDate();
  const firstDow    = new Date(currentYear, currentMonth, 1).getDay();
  const startOff    = firstDow === 0 ? 6 : firstDow - 1;
  const days: (number|null)[] = [
    ...Array(startOff).fill(null),
    ...Array.from({length: daysInMonth}, (_,i) => i+1)
  ];

  const prevMonth = () => currentMonth === 0
    ? (setCurrentMonth(11), setCurrentYear(y => y-1))
    : setCurrentMonth(m => m-1);
  const nextMonth = () => currentMonth === 11
    ? (setCurrentMonth(0), setCurrentYear(y => y+1))
    : setCurrentMonth(m => m+1);

  return (
    /*
     * CalendarView NU are height fixă, NU are overflow.
     * Se întinde cât conținutul.
     * scroll-pane din BookingModal face scroll când conținutul depășește 90vh.
     *
     * Pe desktop: calendar + sloturi side-by-side, ambele la înălțimea naturală.
     * Dacă sloturile sunt mai multe decât spațiul disponibil → scroll-pane scrollează.
     */
    <div className="cv">
      {/* ── CALENDAR ── */}
      <div className="cal-col">
        <div className="cal-header">
          <h3>{MONTHS[currentMonth]} <span className="yr">{currentYear}</span></h3>
          <div className="nav">
            <button className="nav-btn" onClick={prevMonth}><ChevronLeft /></button>
            <button className="nav-btn" onClick={nextMonth}><ChevronRight /></button>
          </div>
        </div>

        <div className="weekdays">
          {DAYS.map(d => <div key={d} style={WEEKDAY_STYLE} className="wd">{d}</div>)}
        </div>

        <div className="grid">
          {days.map((day, i) => {
            if (!day) return <div key={`e${i}`} className="empty"/>;
            const ds   = toDateStr(new Date(currentYear, currentMonth, day));
            const sel  = selectedDate === ds;
            const ok   = canSelect(day);
            const tod  = isToday(day);
            const next = nextAvail.includes(ds);
            return (
              <button key={day} onClick={() => ok && handleDate(day)} disabled={!ok}
                className={`day${sel?' sel':''}${!ok?' dis':''}${tod&&!sel?' tod':''}`}
                style={{
                  backgroundColor: sel ? GREEN_SHADE : next ? GRAY_SHADE : 'transparent',
                  border: next && !sel ? `1px solid ${GRAY_SHADE}` : 'none',
                }}>
                {day}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── SLOTURI ── */}
      {selectedDate && (
        <div className="slots-col">
          <div className="slots-head">
            <div className="slots-title">
              <h4>{new Date(selectedDate+'T12:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}</h4>
              {isVerifying && <span className="checking">Checking…</span>}
            </div>
            <div className="fmt-toggle">
              <button onClick={() => setTimeFormat('12h')} className={timeFormat==='12h'?'act':''}>12h</button>
              <button onClick={() => setTimeFormat('24h')} className={timeFormat==='24h'?'act':''}>24h</button>
            </div>
          </div>

          <div className="slots-list">
            {slots.length > 0
              ? slots.map(s => (
                  <button key={s} onClick={() => handleTime(s)}
                    className={`slot${selectedTime===s?' sel':''}`}>
                    {fmt(s)}
                  </button>
                ))
              : <p className="empty-msg">No available slots</p>
            }
          </div>
        </div>
      )}

      <style jsx>{`
        /*
         * .cv = display flex, fără height fixă.
         * Crește natural cât conținutul.
         * scroll-pane din BookingModal scrollează când cv > 90vh.
         */
        .cv {
          display: flex;
          /* fără height, fără overflow — scroll-pane face totul */
        }

        .cal-col {
          flex: 1;
          padding: 28px 32px;
          border-right: ${selectedDate ? '1px solid #eaeef2' : 'none'};
        }

        .cal-header {
          display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;
          }
        .cal-header h3 { font-size: 18px; font-weight: 900; color: #111827; margin: 0; letter-spacing: -0.3px;           font-family: 'Inter', system-ui, sans-serif; font-weight: 400; font-style: normal; letter-spacing: -0.04em;
 }
        .cal-header h3 .yr { color: #9ca3af; font-weight: 400; margin-left: 4px;           font-family: 'Inter', system-ui, sans-serif; font-weight: 400; font-style: normal; letter-spacing: -0.04em;
 }

        .nav { display: flex; gap: 4px; }
        .nav-btn {
          width: 32px; height: 32px; border-radius: 50%;
          border: 1px solid #e5e7eb; background: #fff; color: #6b7280;
          cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .nav-btn:hover { background: #f3f4f6; border-color: #d1d5db; color: #111827; }

        .weekdays { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 10px; }
        .wd { text-align: center; font-size: 12px; color: #9ca3af; padding: 4px 0; }

        .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
        .empty { aspect-ratio: 1; }
        .day {
          aspect-ratio: 1; width: 100%; border-radius: 8px;
          color: #111827; font-size: 13.5px; font-weight: 400;
          cursor: pointer; border: none; background: transparent;
          transition: background 0.15s;
        }
        .day:hover:not(:disabled) { background: #f3f4f6 !important; }
        .day.sel { font-weight: 600; }
        .day.tod { background: #6da2ff !important; }
        .day.dis { color: #d1d5db; cursor: not-allowed; }

        /* Coloana de sloturi — fără overflow propriu, crește natural */
        .slots-col {
          width: 260px;
          flex-shrink: 0;
          padding: 28px 20px;
        }

        .slots-head { margin-bottom: 16px; }
        .slots-title { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .slots-title h4 { font-size: 14px; font-weight: 700; color: #111827; margin: 0;
        font-family: 'Inter', system-ui, sans-serif; font-weight: 400; font-style: normal; letter-spacing: -0.04em; }
        .checking {
          font-size: 10px; color: #9ca3af; background: #f3f4f6;
          border-radius: 10px; padding: 2px 8px;
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

        .fmt-toggle { display: flex; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; width: fit-content; }
        .fmt-toggle button { padding: 4px 9px; font-size: 11px; font-weight: 500; border: none; background: #fff; color: #6b7280; cursor: pointer; transition: background 0.15s, color 0.15s; }
        .fmt-toggle button.act { background: #111827; color: #fff; }

        /* Lista de sloturi — fără overflow, crește natural */
        .slots-list {
          display: flex;
          flex-direction: column;
          gap: 7px;
        }

        .slot {
          width: 100%; padding: 10px 12px; border-radius: 8px;
          border: 1px solid #e5e7eb; background: #fff; color: #111827;
          font-size: 13.5px; font-weight: 500; cursor: pointer;
          transition: border-color 0.15s, background 0.15s, color 0.15s; text-align: center;
        }
        .slot:hover { border-color: #9ca3af; }
        .slot.sel { background: #111827; color: #fff; border-color: #111827; }
        .empty-msg { text-align: center; color: #9ca3af; font-size: 13px; padding: 32px 0; }

        @media (max-width: 768px) {
          .cv { flex-direction: column; }
          .cal-col { border-right: none; border-bottom: 1px solid #eaeef2; padding: 20px; }
          .slots-col { width: 100%; padding: 20px; }
          .slots-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); }
        }
      `}</style>
    </div>
  );
}