'use client';

import React from 'react';
import { useFormContext } from 'react-hook-form';
import OTPInput from '../../otp';
import { useSignUpForm } from '@/hooks/sign-up/use-sign-up';
import { UserRegistrationProps } from '@/schemas/auth.schemas';
import { toast } from 'sonner';

type Props = {
  otp: string;
  setOtp: (value: string) => void;
  userType: 'owner' | 'assistant';
};

const OTPForm = ({ otp, setOtp, userType }: Props) => {
  const { getValues, watch } = useFormContext<UserRegistrationProps>();
  const { onVerifyOTP, loading } = useSignUpForm();

  const handleCompleteRegistration = async () => {
    if (otp.length !== 6) {
      toast.error('Invalid OTP', {
        description: 'OTP must be exactly 6 digits.',
      });
      return;
    }

    const fullname = watch('fullname') || getValues('fullname');
    const email = watch('email') || getValues('email');
    await onVerifyOTP(otp, userType, fullname, email);
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h2 className="text-2xl md:text-4xl font-bold text-2">Verify your email</h2>
        <p className="text-base md:text-sm mt-4 text-1">
          We sent a 6-digit code to your email. Please enter it below.
        </p>
      </div>

      <div className="flex justify-center">
        <OTPInput otp={otp} setOtp={setOtp} />
      </div>

      <button
        type="button"
        disabled={loading || otp.length !== 6}
        onClick={handleCompleteRegistration}
        className="w-full rounded-xl bg-orange-600 px-6 py-4 text-white font-medium transition hover:bg-orange-700 disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {loading ? 'Creating account...' : 'Complete registration'}
      </button>
    </div>
  );
};

export default OTPForm;