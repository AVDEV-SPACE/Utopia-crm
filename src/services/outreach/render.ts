/**
 * Completarea template-urilor (`educational_templates`) pentru un lead. Fără
 * acces la DB, deci se folosește și în browser (compozitorul din fișa lead-ului).
 * Placeholder-e: {{name}} — numele firmei, {{oras}}, {{nisa}}.
 */

/** Conținutul e HTML dacă are tag-uri; altfel e text simplu (paragrafe separate prin rând liber). */
export const isHtmlContent = (content: string) => /<\/?[a-z][^>]*>/i.test(content);

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface TemplateLead {
  company_name: string;
  location: string | null;
  niche: string | null;
}

/** Înlocuiește placeholder-ele; în HTML valorile sunt escapate (un nume cu `&` sau `<` nu strică markup-ul). */
export function renderTemplate(text: string, lead: TemplateLead, html = isHtmlContent(text)): string {
  const values: Record<string, string> = {
    name: lead.company_name,
    oras: lead.location ?? '',
    nisa: lead.niche ?? '',
  };
  return text.replace(/\{\{\s*(name|oras|nisa)\s*\}\}/g, (_, key: string) =>
    html ? escapeHtml(values[key]) : values[key]
  );
}

/** Varianta text a unui HTML: fără <head>/<style>/<script>, cu rânduri noi la blocuri. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(head|style|script|title)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table)>/gi, '\n')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}
