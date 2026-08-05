// src/lib/data.ts

import { sql } from '@/lib/neon-server';

export interface Programare {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  service: string | null;
  date: string | null; 
  time: string | null;
  created_at: string;
}

export async function fetchProgramari(): Promise<Programare[]> {
  try {
    const data = await sql`SELECT * FROM crm_pack ORDER BY created_at DESC`;
    return data as Programare[];
  } catch (error) {
    console.error("Error fetching programari:", error);
    return [];
  }
}