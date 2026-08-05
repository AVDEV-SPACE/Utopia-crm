// src/app/context/use-auth-context.tsx (sau numele fișierului tău exact)

'use client';

import React, { createContext, useContext, useState } from 'react';

type AuthContextType = {
  currentStep: number;
  setCurrentStep: React.Dispatch<React.SetStateAction<number>>;
  onNext: () => void;    
  onPrev?: () => void;    
};

const InitialValues: AuthContextType = {
  currentStep: 1,
  setCurrentStep: () => undefined,
  onNext: () => {},          // ← funcție goală ca fallback
};

const authContext = createContext<AuthContextType>(InitialValues);

const { Provider } = authContext;

export const AuthContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [currentStep, setCurrentStep] = useState<number>(InitialValues.currentStep);

  const onNext = () => {
    setCurrentStep((prev) => prev + 1);
  };

  const onPrev = () => {
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  const values: AuthContextType = {
    currentStep,
    setCurrentStep,
    onNext,
    onPrev,
  };

  return <Provider value={values}>{children}</Provider>;
};

export const useAuthContextHook = (): AuthContextType => {
  const context = useContext(authContext);
  if (!context) {
    throw new Error('useAuthContextHook must be used within an AuthContextProvider');
  }
  return context;
};