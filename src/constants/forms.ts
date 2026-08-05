// src/constants/forms.ts

type UserRegistrationProps = {
  id: string;
  inputType: 'input' | 'select' | 'textarea';
  type: 'text' | 'email' | 'password' | 'tel';
  options?: { value: string; label: string; id: string }[];
  label?: string;
  placeholder: string;
  name: string;
};

export const USER_REGISTRATION_FORM: UserRegistrationProps[] = [
  {
    id: '1',
    inputType: 'input',
    type: 'text',
    placeholder: 'Full name',
    name: 'fullname',
    label: 'Full Name',
  },
  {
    id: '2',
    inputType: 'input',
    type: 'email',
    placeholder: 'Email',
    name: 'email',
    label: 'Email',
  },
  {
    id: '3',
    inputType: 'input',
    type: 'email',
    placeholder: 'Confirm Email',
    name: 'confirmEmail',
    label: 'Confirm Email',
  },
  {
    id: '4',
    inputType: 'input',
    type: 'password',
    placeholder: 'Password',
    name: 'password',
    label: 'Password',
  },
  {
    id: '5',
    inputType: 'input',
    type: 'password',
    placeholder: 'Confirm Password',
    name: 'confirmPassword',
    label: 'Confirm Password',
  },
];


export const USER_LOGIN_FORM: UserRegistrationProps[] = [
  {
    id: '1',
    inputType: 'input',
    placeholder: 'Enter your email',
    name: 'email',
    type: 'email',
    label: 'Email',
  },
  {
    id: '2',
    inputType: 'input',
    placeholder: 'Password',
    name: 'password',
    type: 'password',
    label: 'Password',
  },
];