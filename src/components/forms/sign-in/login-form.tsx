// src/components/forms/sign-in/login-form.tsx
'use client';

import React from 'react';
import { useFormContext } from 'react-hook-form';
import FormGenerator from '../form-generator';
import { USER_LOGIN_FORM } from '@/constants/forms';

type LoginFormProps = {
  step: 'email' | 'otp';
};

const LoginForm = ({ step }: LoginFormProps) => {
  const { register, formState: { errors } } = useFormContext();

  return (
    <>
      <h2 className="text-3xl md:text-4xl font-bold text-center text-2">
        {step === 'email' ? 'Autentificare' : 'Verifică codul OTP'}
      </h2>
      <p className="text-center text-neutral-400 mt-2 mb-6">
        {step === 'email'
          ? 'Introdu email-ul și parola pentru a continua'
          : 'Codul a fost trimis pe adresa ta de email. Verifică inbox/spam.'}
      </p>

      {step === 'email' && (
        <div className="space-y-4">
          {USER_LOGIN_FORM.map((field) => (
            <FormGenerator
              key={field.id}
              {...field}
              errors={errors}
              register={register}
              name={field.name}
            />
          ))}
        </div>
      )}
    </>
  );
};

export default LoginForm;