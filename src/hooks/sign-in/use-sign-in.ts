// src/hooks/sign-in/use-sign-in.ts
import { UserLoginProps, UserLoginSchema } from '@/schemas/auth.schemas';
import { useSignIn } from '@clerk/nextjs';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';

type SignInStep = 'email' | 'otp';

interface EmailCodeFactor {
  strategy: string;
  emailAddressId: string;
  safeIdentifier?: string;
  primary?: boolean;
}

export const useSignInForm = () => {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [loading, setLoading] = useState<boolean>(false);
  const [step, setStep] = useState<SignInStep>('email');
  const [otp, setOtp] = useState<string>('');

  const router = useRouter();

  const methods = useForm<UserLoginProps>({
    resolver: zodResolver(UserLoginSchema),
    mode: 'onChange',
  });

  const onHandleSubmit = methods.handleSubmit(async (values: UserLoginProps) => {
    if (!isLoaded || !signIn) return;

    setLoading(true);

    try {
      const result = await signIn.create({
        identifier: values.email,
        password: values.password || '',
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });

        toast.success('Bine ai revenit!', {
          description: 'Te-ai autentificat cu succes.',
        });

        router.push('/overview');
        return;
      }

      if (result.status === 'needs_first_factor' || result.status === 'needs_second_factor') {
        const emailCodeFactor = result.supportedFirstFactors?.find(
          (factor) => factor.strategy === 'email_code'
        ) as EmailCodeFactor | undefined;

        if (emailCodeFactor) {
          try {
            await signIn.prepareFirstFactor({
              strategy: 'email_code',
              emailAddressId: emailCodeFactor.emailAddressId,
            });

            setStep('otp');
            toast.info('Cod OTP trimis', {
              description: 'Verifică inbox-ul sau spam-ul pentru codul de 6 cifre.',
            });
            setLoading(false);
            return;
          } catch (prepareError) {
            console.error('Eroare la pregătirea codului OTP:', prepareError);
            toast.error('Eroare trimitere cod', {
              description: 'Nu s-a putut trimite codul. Încearcă din nou.',
            });
            setLoading(false);
            return;
          }
        }

        toast.error('Metodă de verificare indisponibilă', {
          description: 'Contactează suportul pentru ajutor.',
        });
        setLoading(false);
        return;
      }

      toast.error('Autentificare eșuată', {
        description: `Status necunoscut: ${result.status}. Contactează suportul.`,
      });
      setLoading(false);
    } catch (error) {
      setLoading(false);

      if (isClerkAPIResponseError(error)) {
        const err = error.errors[0];

        switch (err.code) {
          case 'form_password_incorrect':
            toast.error('Parolă incorectă', { description: 'Verifică parola.' });
            break;
          case 'form_identifier_not_found':
            toast.error('Cont inexistent', { description: 'Nu există acest email.' });
            break;
          default:
            toast.error('Eroare autentificare', { description: err.longMessage || 'A apărut o eroare neașteptată.' });
        }
      } else {
        toast.error('Eroare neașteptată', { description: 'Încearcă din nou sau contactează suportul.' });
      }
    }
  });

  const onVerifyOTP = async () => {
    if (!isLoaded || !signIn || !otp) return;

    setLoading(true);

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'email_code',
        code: otp.trim(),
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });

        toast.success('Autentificare reușită!', {
          description: 'Bine ai venit înapoi.',
        });

        router.push('/overview');
        setStep('email');
        setOtp('');
      } else {
        toast.error('Cod incorect', {
          description: 'Verifică codul și încearcă din nou.',
        });
      }
    } catch (error) {
      if (isClerkAPIResponseError(error)) {
        toast.error('Eroare verificare', {
          description: error.errors?.[0]?.longMessage || 'Cod invalid sau expirat.',
        });
      } else {
        toast.error('Eroare neașteptată', { description: 'Încearcă din nou.' });
      }
    } finally {
      setLoading(false);
    }
  };

  return {
    methods,
    onHandleSubmit,
    loading,
    step,
    otp,
    setOtp,
    onVerifyOTP,
  };
};