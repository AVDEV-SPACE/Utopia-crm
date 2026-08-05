'use client';

import React, { useState, useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import TypeSelectionForm from './type-selection-form';
import dynamic from 'next/dynamic';
import { useAuthContextHook } from '@/app/context/use-auth-context';

const Spinner = () => (
  <div className="flex justify-center items-center h-32">
    <div className="animate-spin rounded-full h-8 w-8 border-t-4 border-b-4 border-orange-600"></div>
  </div>
);

const DetailForm = dynamic(() => import('./account-details-form'), {
  ssr: false,
  loading: () => <Spinner />,
});

const OTPForm = dynamic(() => import('./otp-form'), {
  ssr: false,
  loading: () => <Spinner />,
});

// 1. Definim tipul de props (obligatoriu!)
type RegistrationFormStepProps = {
  userType: 'owner' | 'assistant';
  setUserType: React.Dispatch<React.SetStateAction<'owner' | 'assistant'>>;
};

// 2. Componenta primește props și le folosește
const RegistrationFormStep = ({ userType, setUserType }: RegistrationFormStepProps) => {
  const { register, formState: { errors }, setValue } = useFormContext();
  const { currentStep, onNext } = useAuthContextHook();

  const [otp, setOtp] = useState<string>('');

  useEffect(() => {
    setValue('otp', otp, { shouldValidate: false });
  }, [otp, setValue]);

  switch (currentStep) {
    case 1:
      return (
        <TypeSelectionForm
          userType={userType}        // ← acum vine din props
          setUserType={setUserType}  // ← acum vine din props
        />
      );

    case 2:
      return (
        <DetailForm 
          userType={userType} 
          onNext={onNext}
        />
      );

    case 3:
      return <OTPForm otp={otp} setOtp={setOtp} userType={userType} />;

    default:
      return null;
  }
};

export default RegistrationFormStep;