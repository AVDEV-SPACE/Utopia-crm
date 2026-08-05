// src/components/forms/sign-up/form-generator.tsx
'use client';

import React from 'react';
import { FieldErrors, FieldValues, UseFormRegister } from 'react-hook-form';
import { ErrorMessage } from '@hookform/error-message';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

type Props = {
  type: 'text' | 'email' | 'password' | 'tel';
  inputType: 'select' | 'input' | 'textarea';
  options?: { value: string; label: string; id: string }[];
  label?: string;
  placeholder: string;
  register: UseFormRegister<any>;
  name: string;
  errors: FieldErrors<FieldValues>;
  lines?: number;
  form?: string;
};

const FormGenerator = ({
  errors,
  inputType,
  name,
  placeholder,
  register,
  type,
  form,
  label,
  lines,
  options,
}: Props) => {
  switch (inputType) {
    
case 'input':

    default:
      return (
        <div className="flex flex-col gap-2">
          {label && (
            <Label htmlFor={name} className="text-neutral-300 font-medium">
              {label}
            </Label>
          )}
          <Input
            id={name}
            type={type}
            placeholder={placeholder}
            {...register(name)}
            className="text-white"
          />
          <ErrorMessage
            errors={errors}
            name={name}
            render={({ message }) => (
              <p className="text-red-400 text-sm mt-1">
                {message === 'Required' ? '' : message}
              </p>
            )}
          />
        </div>
      );

    case 'select':
      return (
        <Label htmlFor={`select-${label}`}>
          {label && label}
          <select
            id={`select-${label}`}
            form={form}
            {...register(name)}
          >
            {options?.length && 
              options.map((option) => (
                <option
                  value={option.value}
                  key={option.id}
                >
                  {option.label}
                </option>
              ))
            }
          </select>
          <ErrorMessage
            errors={errors}
            name={name}
            render={({ message }) => (
              <p className="text-red-400 mt-2">
                {message === 'Required' ? '' : message}
              </p>
            )}
          />
        </Label>
      );

    case 'textarea':
      return (
        <Label
          className="flex flex-col gap-2"
          htmlFor={`textarea-${label}`}
        >
          {label && label}
          <textarea
            id={`textarea-${label}`}
            rows={lines}
            placeholder={placeholder}
            form={form}
            {...register(name)}
          />
          <ErrorMessage
            errors={errors}
            name={name}
            render={({ message }) => (
              <p className="text-red-400 mt-2">
                {message === 'Required' ? '' : message}
              </p>
            )}
          />
        </Label>
      );
  }
};

export default FormGenerator;