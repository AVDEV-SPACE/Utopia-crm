'use client';

import UserTypeCard from './user-type-card';

type Props = {
  userType: 'owner' | 'assistant';
  setUserType: React.Dispatch<React.SetStateAction<'owner' | 'assistant'>>;
};

const TypeSelectionForm = ({ userType, setUserType }: Props) => {
  return (
    <>
      <h2 className="text-2xl md:text-4xl font-bold text-2">Create an account</h2>
      <p className="text-base md:text-sm text-1">
        Tell us about yourself! What do you do? Let's tailor your
        <br /> experience so it best suits you.
      </p>

      <UserTypeCard
        userType={userType}
        setUserType={setUserType}
        value="owner"
        title="I own a business"
        text="Setting up my account for my company."
      />

      <UserTypeCard
        userType={userType}
        setUserType={setUserType}
        value="assistant"
        title="I'm an assistant"
        text="I help manage clients and tasks in the company."
      />
    </>
  );
};

export default TypeSelectionForm;