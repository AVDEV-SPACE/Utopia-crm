// src/app/(auth)/sign-in/page.tsx
'use client';

import SignInFormProvider from '@/components/forms/sign-in/form-provider';
import LoginForm from '@/components/forms/sign-in/login-form';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useSignInForm } from '@/hooks/sign-in/use-sign-in';

const SignInPage = () => {
  const { methods, onHandleSubmit, loading, step, otp, setOtp, onVerifyOTP } = useSignInForm();

  return (
    <SignInFormProvider methods={methods} onHandleSubmit={onHandleSubmit} loading={loading}>
      <div className="flex flex-col gap-8">
        <LoginForm step={step} />

        <div className="flex flex-col gap-4">
          {step === 'email' ? (
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-6 rounded-xl transition"
            >
              {loading ? 'Se procesează...' : 'Autentificare'}
            </Button>
          ) : (
            <div className="flex flex-col gap-6 animate-fade-in">
              <div className="text-center text-neutral-300 text-sm">
                Cod OTP trimis pe email. Verifică inbox/spam.
              </div>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="Cod OTP (6 cifre)"
                maxLength={6}
                className="w-full px-4 py-4 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
              <Button
                type="button"
                onClick={onVerifyOTP}
                disabled={loading || otp.length !== 6}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-6 rounded-xl transition"
              >
                {loading ? 'Se verifică...' : 'Verifică codul'}
              </Button>
            </div>
          )}

          <p className="text-center text-neutral-400 text-sm mt-4">
            Nu ai cont?{' '}
            <Link href="/auth/sign-up" className="text-orange-500 font-semibold hover:text-orange-400 hover:underline transition">
              Creează unul acum
            </Link>
          </p>
        </div>
      </div>
    </SignInFormProvider>
  );
};

export default SignInPage;