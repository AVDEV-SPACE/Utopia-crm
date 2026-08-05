'use client';

// src/components/forms/sign-up/account-details-form.tsx

import { useFormContext } from 'react-hook-form';
import { USER_REGISTRATION_FORM } from '@/constants/forms';
import FormGenerator from '../form-generator';
import { UserRegistrationProps } from '@/schemas/auth.schemas';

type Props = {
  userType: 'owner' | 'assistant';
  onNext: () => void;
};

const AccountDetailsForm = ({ userType, onNext }: Props) => {
  // ── Citește register și errors DIRECT din FormProvider ──
  // Nu mai primim register/errors ca props — sursa unică e FormProvider
  const { register, formState: { errors } } = useFormContext<UserRegistrationProps>();

  return (
    <>
      <h2 className="text-2xl md:text-4xl font-bold text-2">Account details</h2>
      <p className="text-base md:text-sm text-1">
        Enter your email and password
      </p>

      {USER_REGISTRATION_FORM.map((field) => (
        <FormGenerator
          key={field.id}
          {...field}
          errors={errors}
          register={register}
          name={field.name}
        />
      ))}
    </>
  );
};

export default AccountDetailsForm;