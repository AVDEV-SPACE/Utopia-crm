import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatWhatsAppLink(phone: string, text: string): string {
  // Curăță numărul de telefon de caractere speciale (spații, +, -, paranteze)
  let cleanedPhone = phone.replace(/[^\d]/g, "");

  // Se asigură că are prefixul de țară (ex: adaugă '40' pentru România dacă numărul începe cu '07')
  if (cleanedPhone.startsWith("07") && cleanedPhone.length === 10) {
    cleanedPhone = "40" + cleanedPhone.substring(1);
  } else if (cleanedPhone.startsWith("7") && cleanedPhone.length === 9) {
    cleanedPhone = "40" + cleanedPhone;
  }

  // Codifică textul generat
  const encodedText = encodeURIComponent(text);

  // Returnează URL-ul final
  return `https://wa.me/${cleanedPhone}?text=${encodedText}`;
}