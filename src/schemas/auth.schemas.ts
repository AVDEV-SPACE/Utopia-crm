import { z } from 'zod';

export const UserRegistrationSchema = z.object({
  fullname: z
    .string()
    .min(2, 'Full name must be at least 2 characters')
    .max(100, 'Full name must be less than 100 characters'),
  
  email: z
    .string()
    .email('Invalid email address'),
  
  confirmEmail: z
    .string()
    .email('Invalid email address'),
  
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  
  confirmPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters'),
  
  otp: z
    .string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^\d+$/, 'OTP must contain only numbers')
    .optional()
    .or(z.literal('')),
}).refine((data) => data.email === data.confirmEmail, {
  message: 'Emails do not match',
  path: ['confirmEmail'],
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type UserRegistrationProps = z.infer<typeof UserRegistrationSchema>;

export const UserLoginSchema = z.object({
  email: z
    .string()
    .email({ message: 'You did not enter a valid email' }),
  
  password: z
    .string()
    .optional()
    .or(z.literal('')),
  
  otp: z
    .string()
    .length(6, { message: 'OTP must be exactly 6 digits' })
    .regex(/^\d+$/, { message: 'OTP must contain only numbers' })
    .optional()
    .or(z.literal('')),
});

export type UserLoginProps = z.infer<typeof UserLoginSchema>;