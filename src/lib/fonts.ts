import { Instrument_Serif, Inter, JetBrains_Mono } from 'next/font/google';

// Fonturile din referința de design. Încărcate o singură dată în layout-ul
// rădăcină; variabilele CSS sunt disponibile pe toate rutele.
//   --font-instrument-serif → titluri (`.page-title`, utilitarul `font-serif`)
//   --font-inter / --font-jetbrains-mono → folosite deocamdată de Overview
export const serif = Instrument_Serif({ subsets: ['latin', 'latin-ext'], weight: '400', style: ['normal', 'italic'], variable: '--font-instrument-serif' });
export const sans  = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-inter' });
export const mono  = JetBrains_Mono({ subsets: ['latin', 'latin-ext'], variable: '--font-jetbrains-mono' });

export const fontVariables = `${serif.variable} ${sans.variable} ${mono.variable}`;
