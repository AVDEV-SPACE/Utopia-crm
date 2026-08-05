'use client';

// src/components/forms/sign-up/button-handlers.tsx

import { useFormContext } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useAuthContextHook } from '@/app/context/use-auth-context';
import { useSignUpForm } from '@/hooks/sign-up/use-sign-up';
import { UserRegistrationProps } from '@/schemas/auth.schemas';
import { toast } from 'sonner';

type Props = { userType: 'owner' | 'assistant' };

const ButtonHandler = ({ userType }: Props) => {
  const { setCurrentStep, currentStep } = useAuthContextHook();
  // ── Citește din același FormProvider setat în SignUpFormProvider ──
  const { getValues, trigger, formState: { errors } } = useFormContext<UserRegistrationProps>();
  const { onGenerateOTP, loading } = useSignUpForm();

  const handleContinue = async () => {
    // Declanșează validarea Zod pe câmpurile pasului 2
    const valid = await trigger(['fullname', 'email', 'confirmEmail', 'password', 'confirmPassword']);

    const email    = getValues('email');
    const password = getValues('password');

    console.log('[SIGN-UP] email:', email, 'password:', password, 'valid:', valid);

    if (!email || !password) {
      toast.error('Câmpuri lipsă', { description: 'Completează toate câmpurile.' });
      return;
    }

    if (!valid) {
      const firstMsg = Object.values(errors)[0]?.message;
      toast.error('Date invalide', { description: firstMsg ? String(firstMsg) : 'Verifică câmpurile.' });
      return;
    }

    await onGenerateOTP(email, password, userType, () => setCurrentStep(3));
  };

  if (currentStep === 3) {
    return (
      <p className="text-neutral-400 text-sm text-center mt-6">
        Already have an account?{' '}
        <Link href="/auth/sign-in" className="text-orange-500 font-semibold hover:underline">Sign In</Link>
      </p>
    );
  }

  if (currentStep === 2) {
    return (
      <div className="w-full flex flex-col gap-4 items-center mt-6">
        <Button
          type="button"
          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium disabled:opacity-50"
          disabled={loading}
          onClick={handleContinue}
        >
          {loading ? 'Se trimite...' : 'Continue'}
        </Button>
        <p className="text-neutral-400 text-sm">
          Already have an account?{' '}
          <Link href="/auth/sign-in" className="text-orange-500 font-semibold hover:underline">Sign In</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-4 items-center mt-6">
      <Button
        type="button"
        className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium"
        onClick={() => setCurrentStep(2)}
      >
        Create Account
      </Button>
      <p className="text-neutral-400 text-sm">
        Already have an account?{' '}
        <Link href="/auth/sign-in" className="text-orange-500 font-semibold hover:underline">Sign In</Link>
      </p>
    </div>
  );
};

export default ButtonHandler;