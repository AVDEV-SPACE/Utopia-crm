// components/FormView.tsx
'use client';

import { useState, useRef, useEffect } from 'react';

interface BookingData {
  full_name?: string;
  email?: string;
  service_desired?: string;
  website_url?: string;
  website_purpose?: string;
  additional_notes?: string;
}

interface Props {
  meetingDate: string;
  meetingTime: string;
  preselectedService: string;
  onSubmit: (data: BookingData) => void;
  onBack: () => void;
  loading: boolean;
}

const SERVICES = [
  'Brand Refresh',
  'One-Pager (new Homepage)',
  'One-Pager (new Landing Page)',
  'Multiple Pages',
];

const Icons = {
  Spinner: () => (
    <svg className="spinner" width="16" height="16" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeDashoffset="32">
        <animate attributeName="stroke-dashoffset" values="32;0" dur="1s" repeatCount="indefinite" />
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
      </circle>
    </svg>
  ),
};

export default function FormView({ 
  meetingDate, meetingTime, preselectedService, onSubmit, onBack, loading 
}: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [formData, setFormData] = useState<BookingData>({ service_desired: preselectedService });
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [emailVerified, setEmailVerified] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const updateFormData = (key: keyof BookingData, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const sendOtp = async () => {
    if (!name.trim()) { setNameError('Name is required'); return; }
    if (!isValidEmail(email)) { setEmailError('Please enter a valid email'); return; }
    setSendingOtp(true); setEmailError('');
    try {
      const res = await fetch('/api/send-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!data.success) { setEmailError(data.message || 'Failed to send code.'); setSendingOtp(false); return; }
      setShowOtp(true); setCooldown(60);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
      if (data.devCode) console.log('OTP:', data.devCode);
    } catch { setEmailError('Failed to send code. Please try again.'); }
    finally { setSendingOtp(false); }
  };

  const handleOtpDigit = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').slice(0, 6).split('');
      pasted.forEach((d, i) => { if (i < 6) newDigits[i] = d; });
      setOtpDigits(newDigits);
      inputRefs.current[Math.min(pasted.length - 1, 5)]?.focus();
      if (newDigits.every(d => d)) setTimeout(() => verifyOtp(newDigits.join('')), 100);
      return;
    }
    newDigits[index] = value; setOtpDigits(newDigits); setOtpError('');
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (newDigits.every(d => d)) setTimeout(() => verifyOtp(newDigits.join('')), 100);
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const verifyOtp = async (code?: string) => {
    const otpCode = code || otpDigits.join('');
    if (otpCode.length < 6) { setOtpError('Please enter all 6 digits'); return; }
    setVerifyingOtp(true); setOtpError('');
    try {
      const res = await fetch('/api/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode }),
      });
      const data = await res.json();
      if (!data.success) {
        setOtpError(data.message || 'Invalid code.'); setOtpDigits(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus(); setVerifyingOtp(false); return;
      }
      setEmailVerified(true); setVerifyingOtp(false);
      updateFormData('full_name', name); updateFormData('email', email);
    } catch {
      setOtpError('Invalid code.'); setOtpDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally { setVerifyingOtp(false); }
  };

  const handleSubmit = () => {
    if (!emailVerified) { setOtpError('Please verify your email first'); return; }
    onSubmit({ ...formData, full_name: name, email });
  };

  const inputStyle = (error?: boolean): React.CSSProperties => ({
    width: '100%', padding: '12px 16px',
    border: `1px solid ${error ? '#ef4444' : '#eaeef2'}`,
    borderRadius: '10px', fontSize: '14px', outline: 'none',
    transition: 'border-color 0.2s', backgroundColor: '#fff',
    boxSizing: 'border-box',
  });

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '13px', fontWeight: '600',
    color: '#374151', marginBottom: '6px',
  };

  const errorText = (msg: string) => msg
    ? <p style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>{msg}</p>
    : null;

  return (
    /*
     * FormView NU are overflow propriu.
     * scroll-area din BookingModal face scroll pentru tot conținutul.
     * Wheel events ajung la handler-ul din BookingModal neinterceptate.
     */
    <div className="fv">
      <div className="fv-inner">
        <button onClick={onBack} className="back-btn">← Back to calendar</button>

        <div className="fv-content">
          {/* Nume */}
          <div className="fg">
            <label style={labelStyle}>Your name <span style={{color:'#ef4444'}}>*</span></label>
            <input type="text" style={inputStyle(!!nameError)} placeholder="Dr. Maria Popescu"
              value={name} onChange={e => { setName(e.target.value); setNameError(''); }}
              disabled={emailVerified} />
            {errorText(nameError)}
          </div>

          {/* Email */}
          <div className="fg">
            <label style={labelStyle}>Email address <span style={{color:'#ef4444'}}>*</span></label>
            <input type="email" style={inputStyle(!!emailError)} placeholder="hello@yourpractice.com"
              value={email} onChange={e => { setEmail(e.target.value); setEmailError(''); }}
              disabled={emailVerified} />
            {errorText(emailError)}
            {emailVerified && (
              <div className="verified-badge">✅ Email verified</div>
            )}
          </div>

          {/* Send OTP button */}
          {!showOtp && !emailVerified && (
            <button onClick={sendOtp} disabled={sendingOtp} className="action-btn">
              {sendingOtp ? <><Icons.Spinner /> Sending verification...</> : 'Send verification code →'}
            </button>
          )}

          {/* OTP input */}
          {showOtp && !emailVerified && (
            <div className="otp-box">
              <p className="otp-hint">Enter the 6-digit code sent to {email}</p>
              <div className="otp-row">
                {otpDigits.map((digit, i) => (
                  <input key={i} ref={el => { inputRefs.current[i] = el; }}
                    type="text" inputMode="numeric" maxLength={6}
                    value={digit} onChange={e => handleOtpDigit(i, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(i, e)}
                    onFocus={e => e.target.select()}
                    className={`otp-d ${otpError ? 'err' : ''}`} />
                ))}
              </div>
              {otpError && <p className="otp-err">⚠️ {otpError}</p>}
              <div className="otp-actions">
                {verifyingOtp ? (
                  <div className="verifying-row"><Icons.Spinner /> Verifying...</div>
                ) : (
                  <button onClick={() => verifyOtp()} disabled={otpDigits.some(d => !d)} className="verify-btn">
                    Verify code
                  </button>
                )}
                <button onClick={async () => {
                  if (cooldown > 0) return;
                  setOtpDigits(['','','','','','']); setOtpError(''); await sendOtp();
                }} disabled={cooldown > 0} className="resend-btn">
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </div>
            </div>
          )}

          {/* Website URL */}
          <div className="fg">
            <label style={labelStyle}>Do you currently have a website?</label>
            <input type="text" style={inputStyle()} placeholder="www.yoursite.com (or 'not yet')"
              value={formData.website_url || ''} onChange={e => updateFormData('website_url', e.target.value)} />
          </div>

          {/* Website purpose */}
          <div className="fg">
            <label style={labelStyle}>What makes you want to improve your website?</label>
            <textarea style={{...inputStyle(), resize:'vertical', minHeight:'80px'} as React.CSSProperties}
              placeholder="Why now? What are your challenges or desires? Why us?"
              value={formData.website_purpose || ''} onChange={e => updateFormData('website_purpose', e.target.value)} />
          </div>

          {/* Service */}
          <div className="fg">
            <label style={labelStyle}>Which service are you interested in? <span style={{color:'#ef4444'}}>*</span></label>
            <div className="services">
              {SERVICES.map(s => (
                <label key={s} className={`svc ${formData.service_desired === s ? 'sel' : ''}`}>
                  <input type="radio" name="service" value={s}
                    checked={formData.service_desired === s}
                    onChange={() => updateFormData('service_desired', s)}
                    style={{display:'none'}} />
                  <span>{s}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="fg">
            <label style={labelStyle}>Do you have any specific questions?</label>
            <textarea style={{...inputStyle(), resize:'vertical', minHeight:'80px'} as React.CSSProperties}
              placeholder="Please share anything that will help prepare for our meeting."
              value={formData.additional_notes || ''} onChange={e => updateFormData('additional_notes', e.target.value)} />
          </div>

          {/* Submit final */}
          {emailVerified && (
            <button onClick={handleSubmit} disabled={loading} className="action-btn final"
              style={{ opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? <><Icons.Spinner /> Creating Google Meet...</> : 'Confirm meeting →'}
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        /*
         * CRITIC: fără overflow, fără height fixă.
         * scroll-area din BookingModal (overflow-y:scroll + scrollbar ascuns)
         * face scroll pentru tot conținutul acestui formular.
         */
        .fv {
          background: #fff;
          /* fără overflow, fără height — se întinde natural */
        }

        .fv-inner {
          padding: 32px;
        }

        .back-btn {
          background: none; border: none; cursor: pointer;
          color: #6b7280; font-size: 13px; margin-bottom: 24px;
          display: flex; align-items: center; gap: 4px; padding: 0;
        }
        .back-btn:hover { color: #111827; }

        .fv-content { max-width: 500px; }

        .fg { margin-bottom: 24px; }

        .verified-badge {
          display: inline-flex; align-items: center; gap: 6px;
          margin-top: 8px; padding: 8px 12px;
          background: #f0fdf4; border: 1px solid #bbf7d0;
          border-radius: 8px; color: #166534; font-size: 13px; font-weight: 500;
        }

        .action-btn {
          width: 100%; padding: 14px;
          background: #6da2ff; color: #ffffff;
          border: none; border-radius: 8px;
          font-weight: 600; font-size: 15px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: background 0.2s; margin-bottom: 32px;
        }
        .action-btn:hover:not(:disabled) { background: #5a8ae0; }
        .action-btn.final { margin-top: 8px; margin-bottom: 48px; }

        .otp-box {
          margin-bottom: 32px; padding: 20px;
          background: #f9fafb; border-radius: 12px; border: 1px solid #eaeef2;
        }
        .otp-hint { font-size: 13px; color: #4b5563; margin-bottom: 16px; text-align: center; }
        .otp-row { display: flex; justify-content: center; gap: 8px; margin-bottom: 16px; }
        .otp-d {
          width: 48px; height: 58px; text-align: center;
          font-size: 26px; font-weight: 800; font-family: monospace;
          border: 2px solid #eaeef2; border-radius: 10px; outline: none;
          background: #fff; color: #111827; transition: border-color 0.2s;
        }
        .otp-d:focus { border-color: #111827; }
        .otp-d.err { border-color: #ef4444; }
        .otp-err { color: #ef4444; font-size: 13px; margin-bottom: 12px; text-align: center; }
        .otp-actions { display: flex; flex-direction: column; gap: 12px; align-items: center; }
        .verifying-row { display: flex; align-items: center; gap: 8px; color: #6b7280; font-size: 14px; }
        .verify-btn {
          width: 100%; padding: 12px; background: #6da2ff; color: #ffffff;
          border: none; border-radius: 100px; font-weight: 600; font-size: 14px; cursor: pointer;
          transition: background 0.2s;
        }
        .verify-btn:hover:not(:disabled) { background: #5a8ae0; }
        .verify-btn:disabled { background: #e5e7eb; color: #9ca3af; cursor: not-allowed; }
        .resend-btn {
          background: none; border: none; cursor: pointer;
          color: #4a7c59; font-size: 13px; font-weight: 500;
        }
        .resend-btn:disabled { color: #d1d5db; cursor: not-allowed; }

        .services { display: flex; flex-direction: column; gap: 8px; }
        .svc {
          display: flex; align-items: center; padding: 12px 16px;
          border: 1px solid #eaeef2; border-radius: 10px;
          cursor: pointer; transition: all 0.2s; font-weight: 500; color: #111827;
        }
        .svc:hover { background: #f9fafb; }
        .svc.sel { background: #111827; border-color: #111827; color: #fff; }

        @media (max-width: 768px) {
          .fv-inner { padding: 20px; }
          .fv-content { max-width: 100%; }
          .otp-row { gap: 4px; }
          .otp-d { width: 42px; height: 52px; font-size: 22px; }
        }
      `}</style>
    </div>
  );
}