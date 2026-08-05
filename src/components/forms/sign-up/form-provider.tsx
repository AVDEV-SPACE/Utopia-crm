'use client';

import React from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserRegistrationSchema, UserRegistrationProps } from '@/schemas/auth.schemas';

type SignUpFormProviderProps = {
  children: React.ReactNode;
};

const SignUpFormProvider = ({ children }: SignUpFormProviderProps) => {
  const methods = useForm<UserRegistrationProps>({
    resolver: zodResolver(UserRegistrationSchema),
    mode: 'onBlur',
  });

  return (
    <FormProvider {...methods}>
      {children}
    </FormProvider>
  );
};

export default SignUpFormProvider;
