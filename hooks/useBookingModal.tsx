'use client';
import React, { createContext, useContext, useState } from 'react';

interface BookingModalContextType {
  isOpen: boolean;
  preselectedService: string;
  openModal: (service?: string) => void;
  closeModal: () => void;
}

const BookingModalContext = createContext<BookingModalContextType | undefined>(undefined);

export function BookingModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [preselectedService, setPreselectedService] = useState('');

  const openModal = (service = '') => {
    setPreselectedService(service);
    setIsOpen(true);
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
  };

  const closeModal = () => {
    setIsOpen(false);
    setPreselectedService('');
    if (typeof document !== 'undefined') {
      document.body.style.overflow = '';
    }
  };

  return (
    <BookingModalContext.Provider value={{ isOpen, preselectedService, openModal, closeModal }}>
      {children}
    </BookingModalContext.Provider>
  );
}

export function useBookingModal() {
  const ctx = useContext(BookingModalContext);
  if (!ctx) {
    // Return default values instead of throwing error
    return {
      isOpen: false,
      preselectedService: '',
      openModal: () => {},
      closeModal: () => {},
    };
  }
  return ctx;
}
