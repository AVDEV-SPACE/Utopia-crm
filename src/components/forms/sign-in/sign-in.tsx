import LoginForm from '@/components/forms/sign-in/login-form';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useSignInForm } from '@/hooks/sign-in/use-sign-in';

const SignInPageContent = () => {
  const { step } = useSignInForm();

  return (
    <div className="flex flex-col gap-6">
      <LoginForm step={step} />
      <div className="flex flex-col gap-4">
        <Button
          type="submit"
          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-6 rounded-xl transition"
        >
          {step === 'email' ? 'Autentificare' : 'Verific Codul'}
        </Button>
        {step === 'email' && (
          <p className="text-center text-neutral-400 text-sm">
            Nu ai cont?{' '}
            <Link
              href="/auth/sign-up"
              className="text-orange-500 font-semibold hover:text-orange-400 hover:underline transition"
            >
              Creează unul acum
            </Link>
          </p>
        )}
      </div>
    </div>
  );
};

export default SignInPageContent