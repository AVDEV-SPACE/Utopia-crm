/**
 * Copie statică a pachetelor din UTOPIA-SITE/lib/stripe-packages.ts.
 * Nu există sincronizare automată cu utopia-systems.ro — actualizează manual
 * aici dacă se schimbă prețurile/pachetele pe site.
 */
export const UTOPIA_SERVICES = [
  {
    id: 'classic',
    name: 'Pack Classic',
    description:
      'Site web de prezentare profesional — structură clară, formulare inteligente, SEO optimizat, design responsive.',
    priceEur: 680,
  },
  {
    id: 'conversion',
    name: 'High Conversion Pack',
    description:
      'Vizitatori transformați în clienți — follow-ups instant, social proof automatizat, asistent AI integrat.',
    priceEur: 880,
  },
  {
    id: 'automation',
    name: 'Automation Pack',
    description:
      'Business-ul tău lucrează non-stop — AI chatbots 24/7, automatizări complete, scalabilitate garantată.',
    priceEur: 1200,
  },
] as const;
