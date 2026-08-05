// components/BookingModal.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useBookingModal } from '@/hooks/useBookingModal';
import CalendarView from './CalendarView';
import FormView from './FormView';
import SuccessView from './SuccessScreen';

type View = 'calendar' | 'form' | 'success';

const IconSprite = () => (
  <svg style={{ display: 'none' }}>
    <defs>
      <symbol id="clock" viewBox="0 0 16 16" fill="none" stroke="currentColor">
        <circle cx="8" cy="8" r="6.5" strokeWidth="1.2"/>
        <path d="M8 4V8L10 10" strokeWidth="1.2" strokeLinecap="round"/>
      </symbol>
      <symbol id="globe" viewBox="0 0 16 16" fill="none" stroke="currentColor">
        <circle cx="8" cy="8" r="6.5" strokeWidth="1.2"/>
        <path d="M2.5 8H13.5M8 1.5C9.5 3 10.5 5.5 10.5 8C10.5 10.5 9.5 13 8 14.5C6.5 13 5.5 10.5 5.5 8C5.5 5.5 6.5 3 8 1.5Z" strokeWidth="1.2"/>
      </symbol>
      <symbol id="chevron-down" viewBox="0 0 12 12" fill="none" stroke="currentColor">
        <path d="M3 4.5L6 7.5L9 4.5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </symbol>
      <symbol id="calendar" viewBox="0 0 16 16" fill="none" stroke="currentColor">
        <rect x="2" y="3" width="12" height="11" rx="1.5" strokeWidth="1.2"/>
        <path d="M5 1V4M11 1V4M2 7H14" strokeWidth="1.2" strokeLinecap="round"/>
      </symbol>
      <symbol id="x" viewBox="0 0 14 14" fill="none" stroke="currentColor">
        <path d="M2 2L12 12M2 12L12 2" strokeWidth="1.5" strokeLinecap="round"/>
      </symbol>
      <symbol id="star" viewBox="0 0 14 14" fill="currentColor">
        <path d="M7 0L9 5H14L10 8L11.5 13L7 10L2.5 13L4 8L0 5H5L7 0Z"/>
      </symbol>
      <symbol id="check" viewBox="0 0 16 16" fill="none" stroke="currentColor">
        <path d="M13.5 4.5L6.5 11.5L3 8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </symbol>
    </defs>
  </svg>
);

const Icons = {
  Clock: () => <svg height="16" width="16" className="icon" aria-hidden="true"><use href="#clock"/></svg>,
  Globe: () => <svg height="16" width="16" className="icon" aria-hidden="true"><use href="#globe"/></svg>,
  ChevronDown: () => <svg height="12" width="12" className="icon" aria-hidden="true"><use href="#chevron-down"/></svg>,
  Calendar: () => <svg height="16" width="16" className="icon" aria-hidden="true"><use href="#calendar"/></svg>,
  X: () => <svg height="16" width="16" className="icon" aria-hidden="true"><use href="#x"/></svg>,
  Star: () => <svg height="14" width="14" className="icon" aria-hidden="true"><use href="#star"/></svg>,
  Check: () => <svg height="24" width="24" className="icon" aria-hidden="true"><use href="#check"/></svg>,
};

const GoogleMeetIcon = () => (
  <img className="meet-icon" alt="Google Meet"
    src="https://app.cal.com/app-store/googlevideo/logo.webp" width="16" height="16" />
);

const TimezoneSelector = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState('Europe/Bucharest');
  const ref = useRef<HTMLDivElement>(null);
  const timezones = [
    'Europe/London','Europe/Paris','Europe/Berlin','Europe/Bucharest',
    'Europe/Athens','America/New_York','America/Chicago','America/Denver',
    'America/Los_Angeles','Asia/Dubai','Asia/Singapore','Australia/Sydney'
  ];
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="tz-wrap" ref={ref}>
      <button className="tz-btn" onClick={() => setIsOpen(!isOpen)}>
        <Icons.Globe /><span className="tz-text">{selected}</span><Icons.ChevronDown />
      </button>
      {isOpen && (
        <div className="tz-dropdown">
          {timezones.map(tz => (
            <button key={tz} className={`tz-opt ${tz === selected ? 'sel' : ''}`}
              onClick={() => { setSelected(tz); setIsOpen(false); }}>{tz}</button>
          ))}
        </div>
      )}
      <style jsx>{`
        .tz-wrap { position: relative; width: 100%; }
        .tz-btn { display: flex; align-items: center; gap: 8px; background: none; border: none; padding: 4px 0; color: #4b5563; font-size: 14px; cursor: pointer; width: 100%; }
        .tz-btn:hover { color: #111827; }
        .tz-text { flex: 1; text-align: left; }
        .tz-dropdown { position: absolute; bottom: 100%; left: 0; margin-bottom: 8px; background: #fff; border: 1px solid #eaeef2; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); max-height: 250px; overflow-y: auto; width: 220px; z-index: 50; }
        .tz-opt { width: 100%; text-align: left; padding: 10px 16px; background: none; border: none; font-size: 13px; color: #374151; cursor: pointer; }
        .tz-opt:hover { background: #f3f4f6; }
        .tz-opt.sel { background: #f0fdf4; color: #166534; font-weight: 500; }
      `}</style>
    </div>
  );
};

function Sidebar({ meetingDate, meetingTime }: { meetingDate: string; meetingTime: string }) {
  const fmt = meetingDate && meetingTime
    ? new Date(meetingDate + 'T' + meetingTime).toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      })
    : '';
  return (
    <div className="sidebar">
      <div className="sb-inner">
        <div>
          <div className="avatar">
            <img src="https://ui-avatars.com/api/?name=Marina+Ben&background=1a1a18&color=fff&size=80" alt="Marina & Ben" />
          </div>
          <h2 className="title">Intro Call</h2>
          <p className="subtitle">Get to know us!</p>
          <div className="testimonials">
            <p className="t-label">What our clients say:</p>
            <div className="t-item"><Icons.Star /><p><span className="q">"Game changer"</span> <span className="c">Matt from Compa</span></p></div>
            <div className="t-item"><Icons.Star /><p><span className="q">"Beautiful results"</span> <span className="c">Ulrike from Banxware</span></p></div>
            <div className="t-item"><Icons.Star /><p><span className="q">"Love our new website"</span> <span className="c">Khaled from FP&A</span></p></div>
          </div>
        </div>
        <div className="details">
          {meetingDate && meetingTime && (
            <div className="d-item"><Icons.Calendar /><span>{fmt}</span></div>
          )}
          <div className="d-item"><Icons.Clock /><span>25m</span></div>
          <div className="d-item"><GoogleMeetIcon /><span>Google Meet</span></div>
          <TimezoneSelector />
        </div>
      </div>
      <style jsx>{`
        .sidebar { width: 280px; flex-shrink: 0; background: #fff; border-right: 1px solid #eaeef2; }
        .sb-inner { padding: 32px 24px; display: flex; flex-direction: column; height: 100%; }
        .avatar { width: 48px; height: 48px; border-radius: 50%; overflow: hidden; margin-bottom: 16px; border: 1px solid #eaeef2; }
        .avatar img { width: 100%; height: 100%; object-fit: cover; }
        .title { font-size: 28px; font-weight: 700; color: #111827; margin: 0 0 4px; line-height: 1.2;
        font-family: 'Inter', system-ui, sans-serif; font-weight: 400; font-style: normal; letter-spacing: -0.04em; }
        .subtitle { font-size: 14px; color: #6b7280; margin: 0 0 32px; }
        .testimonials { margin-bottom: 32px; }
        .t-label { font-size: 13px; font-weight: 600; color: #111827; margin: 0 0 8px; }
        .t-item { display: flex; gap: 8px; margin-bottom: 8px; color: #374151; font-size: 13px; }
        .t-item :global(.icon) { flex-shrink: 0; margin-top: 2px; color: #fbbf24; }
        .q { font-style: italic; }
        .c { color: #4a7c59; font-weight: 600; }
        .details { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
        .d-item { display: flex; align-items: center; gap: 10px; font-size: 14px; color: #4b5563; }
        .d-item :global(.icon) { color: #6b7280; flex-shrink: 0; }
        .meet-icon { width: 16px; height: 16px; object-fit: contain; }
        @media (max-width: 768px) {
          .sidebar { width: 100%; border-right: none; border-bottom: 1px solid #eaeef2; }
          .sb-inner { padding: 20px; height: auto; }
          .testimonials { display: none; }
          .details { flex-direction: row; flex-wrap: wrap; gap: 12px 20px; }
        }
      `}</style>
    </div>
  );
}

export default function BookingModal() {
  const { isOpen, closeModal } = useBookingModal();
  const [view, setView] = useState<View>('calendar');
  const [meetingDate, setDate] = useState('');
  const [meetingTime, setTime] = useState('');
  const [meetLink, setMeetLink] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setView('calendar'); setDate(''); setTime(''); setMeetLink(''); setIsSubmitting(false);
    }
  }, [isOpen]);

  // Când modalul e deschis: blochează scroll pagina, redirectează wheel spre modal
  useEffect(() => {
    if (!isOpen) return;

    // Blochează scroll pagina
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';

    // Wheel events → scrollează .scroll-area din modal (fără bara vizibilă)
    const onWheel = (e: WheelEvent) => {
      const el = scrollRef.current;
      if (!el) return;
      // Nu intercepta dacă userul e pe un dropdown cu scroll propriu
      if ((e.target as HTMLElement).closest('.tz-dropdown')) return;
      e.preventDefault();
      el.scrollTop += e.deltaY;
    };
    window.addEventListener('wheel', onWheel, { passive: false });

    // Touch scroll pentru mobile
    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent) => { touchStartY = e.touches[0].clientY; };
    const onTouchMove = (e: TouchEvent) => {
      const el = scrollRef.current;
      if (!el) return;
      if ((e.target as HTMLElement).closest('.tz-dropdown')) return;
      e.preventDefault();
      el.scrollTop -= e.touches[0].clientY - touchStartY;
      touchStartY = e.touches[0].clientY;
    };
    window.addEventListener('touchstart', onTouchStart, { passive: false });
    window.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectSlot = (date: string, time: string) => {
    setDate(date); setTime(time); setView('form');
  };
  const handleBack = () => setView('calendar');
  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/booking', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, meeting_date: meetingDate, meeting_time: meetingTime }),
      });
      const result = await res.json();
      setMeetLink(result.success && result.meetLink
        ? result.meetLink : 'https://meet.google.com/abc-defg-hij');
      setView('success');
    } catch {
      setMeetLink('https://meet.google.com/abc-defg-hij');
      setView('success');
    } finally { setIsSubmitting(false); }
  };

  return (
    <>
      <IconSprite />

      <div className="overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
        <button className="btn-close" onClick={closeModal} aria-label="Close"><Icons.X /></button>

        <div className="modal">
          <Sidebar meetingDate={meetingDate} meetingTime={meetingTime} />

          {/*
           * .scroll-area:
           * - overflow-y: scroll + scrollbar-width: none = scroll fără bara vizibilă
           * - Scrollat din JS (onWheel) când userul mișcă wheel-ul oriunde
           * - Sidebar rămâne fix, doar conținutul din dreapta scrollează
           */}
          <div className="scroll-area" ref={scrollRef}>
            {view === 'calendar' && (
              <CalendarView key="calendar-view" agencyName="Utopia systems" onSelect={handleSelectSlot} />
            )}
            {view === 'form' && (
              <FormView meetingDate={meetingDate} meetingTime={meetingTime}
                preselectedService="" onSubmit={handleSubmit}
                onBack={handleBack} loading={isSubmitting} />
            )}
            {view === 'success' && <SuccessView meetLink={meetLink} onClose={closeModal} />}
          </div>
        </div>
      </div>

      <style jsx>{`
        .overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          overflow: hidden;
        }

        .btn-close {
          position: fixed;
          top: 1rem; right: 1rem;
          z-index: 10000;
          width: 40px; height: 40px; border-radius: 50%;
          border: 1px solid rgba(255,255,255,0.2);
          background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
          cursor: pointer; color: white;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s;
        }
        .btn-close:hover { background: rgba(0,0,0,0.7); }
        .btn-close :global(.icon) { color: white; }

        .modal {
          background: #fff;
          border-radius: 10px;
          width: 100%;
          max-width: 1100px;
          /* Înălțime: viewport minus padding-ul de 24px sus+jos = spațiu vizibil */
          height: calc(100vh - 48px);
          max-height: 800px;
          display: flex;
          overflow: hidden;
          box-shadow: 0 20px 40px rgba(0,0,0,0.15);
          animation: modalEnter 0.3s ease-out;
        }

        /*
         * SCROLL FĂRĂ BARĂ VIZIBILĂ:
         * overflow-y: scroll → activează scroll cu wheel imediat (nu aşteaptă overflow detection)
         * scrollbar-width: none (Firefox) + ::-webkit-scrollbar (Chrome/Safari) → ascunde bara
         * Scrollul e controlat din JS prin onWheel → el.scrollTop += deltaY
         */
        .scroll-area {
          flex: 1;
          min-width: 0;
          overflow-y: scroll;
          overflow-x: hidden;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;        /* Firefox */
          -ms-overflow-style: none;     /* IE/Edge */
        }
        .scroll-area::-webkit-scrollbar {
          display: none;                /* Chrome, Safari, Opera */
        }

        @keyframes modalEnter {
          from { opacity: 0; transform: scale(0.97) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }

        @media (max-width: 768px) {
          .modal { flex-direction: column; height: calc(100vh - 32px); }
          .overlay { padding: 16px 8px; }
          .btn-close { top: 0.5rem; right: 0.5rem; width: 36px; height: 36px; }
        }
      `}</style>
    </>
  );
}