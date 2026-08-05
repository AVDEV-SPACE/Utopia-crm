'use client';

interface Props {
  meetLink: string;
  onClose: () => void;
}

const CheckIcon = () => (
  <svg height="48" width="48" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="#CBFF4D"/>
    <path d="M8 12L11 15L16 9" stroke="#111827" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const GoogleMeetIcon = () => (
  <img
    alt="Google Meet"
    src="https://app.cal.com/app-store/googlevideo/logo.webp"
    width="16"
    height="16"
    style={{ objectFit: 'contain', flexShrink: 0 }}
  />
);

const GmailIcon = () => (
  <svg height="16" width="16" viewBox="0 0 24 24" fill="none">
    <path d="M2 6C2 4.9 2.9 4 4 4H20C21.1 4 22 4.9 22 6V18C22 19.1 21.1 20 20 20H4C2.9 20 2 19.1 2 18V6Z" stroke="#6b7280" strokeWidth="1.4"/>
    <path d="M2 6L12 13L22 6" stroke="#6b7280" strokeWidth="1.4" strokeLinecap="round"/>
  </svg>
);

const ClockIcon = () => (
  <svg height="16" width="16" viewBox="0 0 16 16" fill="none" stroke="#6b7280">
    <circle cx="8" cy="8" r="6.5" strokeWidth="1.2"/>
    <path d="M8 4V8L10 10" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

const CalendarIcon = () => (
  <svg height="16" width="16" viewBox="0 0 16 16" fill="none" stroke="#6b7280">
    <rect x="2" y="3" width="12" height="11" rx="1.5" strokeWidth="1.2"/>
    <path d="M5 1V4M11 1V4M2 7H14" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

export default function SuccessView({ meetLink, onClose }: Props) {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(meetLink);
  };

  return (
    <div className="sv">
      <div className="sv-content">

        <h2>Meeting confirmed!</h2>
        <p className="subtitle">Your Google Meet link has been created</p>

        <div className="meet-link-box">
          <a href={meetLink} target="_blank" rel="noopener noreferrer" className="meet-link">
            {meetLink}
          </a>
          <button onClick={copyToClipboard} className="copy-btn">Copy</button>
        </div>

        <div className="info-box">
          <h3>What's next?</h3>
          <div className="info-item">
            <CalendarIcon />
            <span>The meeting has been added to your calendar</span>
          </div>
          <div className="info-item">
            <GmailIcon />
            <span>You'll receive a confirmation email with the link</span>
          </div>
          <div className="info-item">
            <ClockIcon />
            <span>You can join 5 minutes before the start time</span>
          </div>
          <div className="info-item">
            <GoogleMeetIcon />
            <span>The call will happen on Google Meet</span>
          </div>
        </div>

        <button onClick={onClose} className="done-btn">Done</button>
      </div>

      <style jsx>{`
        .sv {
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 32px;
          min-height: 100%;
        }
        .sv-content {
          max-width: 480px;
          width: 100%;
          text-align: center;
        }
        .sv-content h2 {
          font-family: 'Inter', system-ui, sans-serif; font-weight: 400; font-style: normal; letter-spacing: -0.04em;
        }
        .sv-icon { margin-bottom: 24px; }
        h2 { font-size: 28px; font-weight: 700; color: #111827; margin: 0 0 8px; }
        .subtitle { font-size: 16px; color: #6b7280; margin: 0 0 32px; }

        .meet-link-box {
          display: flex; align-items: center; gap: 8px;
          background: #f3f4f6; border: 1px solid #eaeef2;
          border-radius: 12px; padding: 8px 8px 8px 16px;
          margin-bottom: 32px;
        }
        .meet-link {
          flex: 1; text-align: left; color: #4a7c59;
          font-size: 14px; font-weight: 500; text-decoration: none;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .meet-link:hover { text-decoration: underline; }
        .copy-btn {
          padding: 8px 16px; background: #fff;
          border: 1px solid #eaeef2; border-radius: 8px;
          font-size: 13px; font-weight: 500; color: #374151;
          cursor: pointer; transition: all 0.2s; flex-shrink: 0;
        }
        .copy-btn:hover { background: #f9fafb; border-color: #9ca3af; }

        .info-box {
          background: #f9fafb; border: 1px solid #eaeef2;
          border-radius: 16px; padding: 24px;
          text-align: left; margin-bottom: 32px;
        }
        .info-box h3 {
          font-size: 15px; font-weight: 600;
          color: #111827; margin: 0 0 16px;
        }
        .info-item {
          display: flex; align-items: center; gap: 10px;
          font-size: 14px; color: #4b5563; margin-bottom: 12px;
        }
        .info-item:last-child { margin-bottom: 0; }

        .done-btn {
          width: 100%; padding: 14px;
          background: #111827; color: #fff;
          border: none; border-radius: 100px;
          font-weight: 600; font-size: 15px;
          cursor: pointer; transition: background 0.2s;
        }
        .done-btn:hover { background: #1f2937; }

        @media (max-width: 768px) {
          .sv { padding: 20px; }
          h2 { font-size: 24px; }
          .meet-link-box { flex-direction: column; align-items: stretch; padding: 12px; }
          .meet-link { text-align: center; white-space: normal; word-break: break-all; }
        }
      `}</style>
    </div>
  );
}