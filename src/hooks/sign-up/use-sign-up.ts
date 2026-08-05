'use client';

// src/hooks/sign-up/use-sign-up.ts
// NU mai conține useForm — formul e în SignUpFormProvider

import { useSignUp, useClerk } from '@clerk/nextjs';
import { useState } from 'react';
import { onCompleteUserRegistration } from '@/actions/auth';
import { toast } from 'sonner';

export const useSignUpForm = () => {
  const [loading, setLoading] = useState<boolean>(false);
  const { isLoaded, signUp } = useSignUp();
  const { setActive } = useClerk();

  const checkAuthorization = async (email: string, role: 'owner' | 'assistant') => {
    try {
      const res = await fetch(`/api/check-authorization?email=${encodeURIComponent(email)}&role=${role}`);
      if (!res.ok) return false;
      const data = await res.json();
      return data.authorized;
    } catch {
      return false;
    }
  };

  const onGenerateOTP = async (
    email: string,
    password: string,
    role: 'owner' | 'assistant',
    onNext: () => void
  ) => {
    if (!isLoaded || !signUp) return;
    setLoading(true);
    try {
      const isAuthorized = await checkAuthorization(email, role);
      if (!isAuthorized) {
        toast.error('Acces refuzat', { description: 'Acest email nu este pe lista de așteptare.' });
        return;
      }
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      toast.success('Cod trimis!', { description: 'Verifică email-ul.' });
      onNext();
    } catch (error: any) {
      toast.error('Eroare', { description: error.errors?.[0]?.longMessage || 'Ceva nu a mers.' });
    } finally {
      setLoading(false);
    }
  };

  const onVerifyOTP = async (
    otp: string,
    userType: 'owner' | 'assistant',
    fullname: string,
    email: string
  ) => {
    if (!isLoaded || !signUp) return;
    setLoading(true);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code: otp });
      if (attempt.status !== 'complete') throw new Error('Cod incorect.');
      await setActive({ session: attempt.createdSessionId });
      await onCompleteUserRegistration({
        clerkId: attempt.createdUserId!,
        fullname,
        type: userType,
        email,
      });
      toast.success('Înregistrare completă!');
      window.location.assign('/overview');
    } catch (error: any) {
      toast.error('Eroare', { description: error.errors?.[0]?.longMessage || error.message });
    } finally {
      setLoading(false);
    }
  };

  return { onGenerateOTP, onVerifyOTP, loading };
};