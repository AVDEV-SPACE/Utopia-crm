'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { User } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
} from '@/components/ui/card';

type Props = {
  value: 'owner' | 'assistant';
  title: string;
  text: string;
  userType: 'owner' | 'assistant';
  setUserType: React.Dispatch<React.SetStateAction<'owner' | 'assistant'>>;
};

const UserTypeCard = ({
  value,
  title,
  text,
  userType,
  setUserType,
}: Props) => {
  const isSelected = userType === value;

  return (
    <div
      className={cn(
        'w-full cursor-pointer rounded-lg border-2 transition-all',
        isSelected ? 'border-orange-600' : 'border-gray-400'
      )}
      onClick={() => setUserType(value)}
    >
      <Card className="border-0 bg-transparent shadow-none">
        <CardContent className="flex items-center gap-3 py-6">
          <Card
            className={cn(
              'flex items-center justify-center p-3 rounded-lg border-2',
              isSelected ? 'border-orange-600' : 'border-gray-600'
            )}
          >
            <User
              size={30}
              className={cn(
                'text-gray-400',
                isSelected && 'text-orange-600'
              )}
            />
          </Card>

          <div className="flex-1">
            <CardDescription className="text-2">
              {title}
            </CardDescription>
            <CardDescription className="text-gray-400">
              {text}
            </CardDescription>
          </div>

          <div
            className={cn(
              'w-4 h-4 rounded-full',
              isSelected ? 'bg-orange' : 'bg-transparent'
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default UserTypeCard;