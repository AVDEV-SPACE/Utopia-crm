// src/components/otp.tsx

'use client';

import React, { useRef, useState } from 'react';

type Props = {
  otp: string;
  setOtp: (value: string) => void;
};

const OTPInput = ({ otp, setOtp }: Props) => {
  const [inputs, setInputs] = useState<string[]>(otp.split('').concat(Array(6).fill('')).slice(0, 6));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (index: number, value: string) => {
    // Accepta doar cifre
    if (!/^\d*$/.test(value)) return;

    const newInputs = [...inputs];
    newInputs[index] = value;
    setInputs(newInputs);
    setOtp(newInputs.join(''));

    // Auto-focus la urmatorul input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !inputs[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text');
    const otpArray = pastedData.split('').slice(0, 6);
    
    const newInputs = [...inputs];
    otpArray.forEach((char, index) => {
      if (/^\d$/.test(char)) {
        newInputs[index] = char;
      }
    });
    setInputs(newInputs);
    setOtp(newInputs.join(''));
  };

  return (
    <div className="flex gap-3 justify-center">
      {Array.from({ length: 6 }).map((_, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          type="text"
          maxLength={1}
          value={inputs[index] || ''}
          onChange={(e) => handleChange(index, e.target.value)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          className="w-12 h-12 text-center text-2xl font-bold text-black bg-white border-2 border-gray-400 rounded-lg shadow-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-400 focus:outline-none transition-all"
          placeholder="-"
          inputMode="numeric"
        />
      ))}
    </div>
  );
};

export default OTPInput;