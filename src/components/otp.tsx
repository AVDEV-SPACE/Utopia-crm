// src/components/otp.tsx

'use client';

import { InputOTP, InputOTPSlot } from '@/components/ui/input-otp';

type Props = {
  otp: string;
  setOtp: (value: string) => void;
};

const OTPInput = ({ otp, setOtp }: Props) => {
  return (
    <InputOTP 
      maxLength={6} 
      value={otp} 
      onChange={setOtp}
    >
      <div className="flex gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <InputOTPSlot
            key={index}
            index={index}
            className="w-12 h-12 text-lg border-2 rounded-md focus:border-orange-500"
          />
        ))}
      </div>
    </InputOTP>
  );
};

export default OTPInput;