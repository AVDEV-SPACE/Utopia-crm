// src/components/forms/sign-in/form-provider.tsx
'use client';

import { AuthContextProvider } from '@/app/context/use-auth-context';
import { Loader } from '@/components/loader';
import { useSignInForm } from '@/hooks/sign-in/use-sign-in';
import React from 'react';
import { FormProvider, UseFormReturn } from 'react-hook-form';
import { UserLoginProps } from '@/schemas/auth.schemas'; // importă schema ta

type Props = {
  children: React.ReactNode;
  methods: UseFormReturn<UserLoginProps>; // tip corect din react-hook-form
  onHandleSubmit: (e?: React.FormEvent) => void; // tip corect pentru submit
  loading: boolean;
};

const SignInFormProvider = ({ children, methods, onHandleSubmit, loading }: Props) => {
  return (
    <AuthContextProvider>
      <FormProvider {...methods}>
        <form onSubmit={onHandleSubmit} className="h-full">
          <div className="flex flex-col justify-between gap-3 h-full">
            <Loader loading={loading}>
              {children}
            </Loader>
          </div>
        </form>
      </FormProvider>
    </AuthContextProvider>
  );
};

export default SignInFormProvider;