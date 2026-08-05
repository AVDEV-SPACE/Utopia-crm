'use client';

import { useState } from 'react';
import { AuthContextProvider } from '@/app/context/use-auth-context';
import ButtonHandler from '@/components/forms/sign-up/button-handlers';
import SignUpFormProvider from '@/components/forms/sign-up/form-provider';
import HighlightBar from '@/components/forms/sign-up/highlight-bar';
import RegistrationFormStep from '@/components/forms/sign-up/registration-step';

export default function SignUpPage() {
  const [userType, setUserType] = useState<'owner' | 'assistant'>('owner');

  return (
    <div className="w-full">
      <AuthContextProvider>
        <SignUpFormProvider>
          <div className="flex flex-col gap-3">
            <RegistrationFormStep 
              userType={userType}
              setUserType={setUserType}
            />
            <ButtonHandler userType={userType} />
          </div>
          <HighlightBar />
        </SignUpFormProvider>
      </AuthContextProvider>
    </div>
  );
}