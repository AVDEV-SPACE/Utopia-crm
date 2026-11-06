/**
 * Poziționarea Utopia Systems în toate mesajele scrise de AI: pitch-ul și
 * DM-urile din enrich, follow-up-urile secvenței, „Ajustează cu AI” și
 * generatorul vechi din /leads. Un singur loc de editat când se schimbă tonul.
 *
 * Afirmațiile de expertiză (PROOF_POINTS) sunt singurele „dovezi” pe care AI-ul
 * are voie să le folosească — orice altă cifră sau rezultat e interzis. Țineți
 * aici doar afirmații pe care le puteți susține dacă un client întreabă.
 */

export const COMPANY = `Utopia Systems — echipă de dezvoltare software din România. Construim sisteme profesionale în jurul unui smart website modern: programări online, preluarea automată a cererilor 24/7, agenți AI, automatizări și CRM pentru firme locale.`;

/**
 * Afirmațiile de expertiză aprobate pentru încheiere (una pe mesaj, adaptată
 * la nișă, fără să i se schimbe sensul sau cifrele).
 */
export const PROOF_POINTS = [
  'Folosim datele și expertiza software prin tehnici de predicție testate și verificate: anticipăm momentele în care se pierd cereri și construim sistemul exact în jurul lor.',
  'Construim pe date, nu pe presupuneri: fiecare cerere, apel și programare e măsurată din prima zi, așa că vedeți exact de unde vin clienții noi.',
  'Lucrăm ca o echipă de dezvoltare software, nu ca o agenție de design: arhitectură testată, automatizări verificate înainte de lansare și un sistem care preia cererile 24/7.',
  'Livrăm în etape cu rezultate măsurabile: în primele 14 zile prima parte a sistemului e funcțională, iar decizia de a continua o luați pe baza cifrelor.',
];

/**
 * Ce componente ale sistemului îi lipsesc firmei, din semnalele site-ului —
 * AI-ul propune doar din această listă, nu ce firma are deja.
 */
export function systemGaps(signals: Record<string, boolean | number | null>, siteLoaded: boolean) {
  const all = {
    programari_online: 'programări online direct din site',
    chat: 'răspuns automat 24/7 la mesaje și cereri',
    analytics: 'măsurarea fiecărei cereri și a sursei ei',
    adaptat_mobil: 'experiență completă pe mobil',
  } as const;
  const gaps: string[] = [];
  const has: string[] = [];
  for (const [key, label] of Object.entries(all)) {
    if (siteLoaded && signals[key] === true) has.push(label);
    else gaps.push(label);
  }
  // Preluarea centralizată a cererilor lipsește oricui nu are deja un CRM conectat — nu o putem verifica, o propunem mereu
  gaps.push('preluarea automată a tuturor cererilor într-un singur loc, cu notificare imediată');
  return { componente_lipsa: gaps, are_deja: has };
}

/**
 * Durerile tipice ale nișei: deschiderea pornește de la una dintre ele (formulată
 * ca situație frecventă în domeniu, nu ca fapt despre firmă), legată de o
 * problemă reală din audit când există.
 */
export const NICHE_PAINS: Record<string, string> = {
  dentist: 'pacienții caută programare seara sau în weekend, când recepția nu răspunde, și se programează la clinica următoare găsită pe Google',
  stomatologie: 'pacienții caută programare seara sau în weekend, când recepția nu răspunde, și se programează la clinica următoare găsită pe Google',
  clinica: 'pacienții care nu prind pe nimeni la telefon nu revin — se programează la clinica care le răspunde primul',
  veterinar: 'stăpânii caută ajutor exact când cabinetul e închis, iar o întrebare fără răspuns devine un client pierdut',
  beauty: 'clientele cer programări pe Instagram și WhatsApp la orice oră, iar mesajele la care se răspunde după câteva ore se transformă în locuri goale în agendă',
  hairdresser: 'programările vin pe telefon și mesaje în timpul lucrului, iar fiecare apel nepreluat e un loc gol în agendă',
  fitness: 'interesul apare seara, după antrenamentul altcuiva, iar cererile fără răspuns rapid nu devin abonamente',
  restaurant: 'rezervările se pierd între apeluri nepreluate în orele aglomerate și mesaje la care nu răspunde nimeni',
  hotel: 'o parte din rezervări pleacă la platformele cu comision pentru că rezervarea directă cere un telefon sau un email',
  avocat: 'clienții potențiali contactează mai multe cabinete în aceeași zi și rămân la cel care le răspunde primul, cu o primă evaluare clară',
  imobiliare: 'cererile pentru proprietăți vin la orice oră, iar cine nu răspunde în primele minute pierde clientul în favoarea altei agenții',
  'service auto': 'clienții sună pentru o programare sau un deviz în timpul lucrului, iar apelurile nepreluate ajung la service-ul următor',
  mobilier: 'clienții care cer o ofertă sau o măsurătoare vor un răspuns în aceeași zi, iar cererile rămase pe telefon sau în mesaje ajung la producătorul care răspunde primul',
  mobila: 'clienții care cer o ofertă sau o măsurătoare vor un răspuns în aceeași zi, iar cererile rămase pe telefon sau în mesaje ajung la producătorul care răspunde primul',
  constructii: 'cererile de ofertă vin seara și în weekend, când echipa e pe șantier, iar clientul semnează cu firma care îi trimite prima o estimare',
  contabil: 'antreprenorii schimbă contabilul când nu primesc răspuns rapid la întrebări urgente, iar cererile noi vin mai ales în afara programului',
  psiholog: 'oamenii cer ajutor în momente dificile, adesea seara, iar o cerere fără răspuns rapid rareori se mai repetă',
  kinetoterapie: 'pacienții caută o programare imediat după recomandarea medicului, iar cabinetul care nu răspunde pierde tratamentul întreg, nu doar o ședință',
  pensiune: 'turiștii compară mai multe pensiuni în aceeași seară și rezervă unde pot verifica disponibilitatea și confirma imediat',
  florarie: 'comenzile pentru ocazii vin cu termen scurt, iar clientul comandă unde poate plasa comanda imediat, fără să aștepte un răspuns',
  optica: 'clienții vor să afle pe loc dacă au loc la consult și ce costă ramele, iar cine nu răspunde rapid pierde și consultul, și ochelarii',
};

export const DEFAULT_PAIN =
  'clienții noi aleg firma care le răspunde primul și le face programarea sau oferta cel mai ușor, iar cererile fără răspuns rapid ajung la concurență';

/** Durerea nișei, după cheia normalizată (fără diacritice) sau un cuvânt din ea. */
export function nichePain(niche: string | null): string {
  if (!niche) return DEFAULT_PAIN;
  const key = niche.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (NICHE_PAINS[key]) return NICHE_PAINS[key];
  const match = Object.keys(NICHE_PAINS).find((k) => key.includes(k) || (k.length >= 5 && k.includes(key)));
  return match ? NICHE_PAINS[match] : DEFAULT_PAIN;
}

/**
 * Formulările generice sau slabe, respinse și în cod (nu doar în prompt): un
 * mesaj care le conține e trimis înapoi la AI cu motivul respingerii.
 */
export const BANNED_PHRASES: { pattern: RegExp; label: string }[] = [
  // Granițe de cuvânt cu \p{L}: `\b` din JavaScript nu recunoaște ă, ț, ș ca litere
  { pattern: /(?<!\p{L})site(-uri)?\s+rapid(e)?(?!\p{L})/iu, label: 'site rapid' },
  { pattern: /(?<!\p{L})poten[țt]ial de cre[șs]tere(?!\p{L})/iu, label: 'potențial de creștere' },
  { pattern: /(?<!\p{L})(v-ar interesa|v[ăa] intereseaz[ăa]|v[ăa] interesa)(?!\p{L})/iu, label: 'întrebare de tip „v-ar interesa”' },
  { pattern: /(?<!\p{L})v[ăa] (pot )?ar[ăa]t(a)?(?!\p{L})/iu, label: 'întrebare de tip „vă pot arăta”' },
  { pattern: /(?<!\p{L})(observ|am observat|am remarcat|remarc|am constatat|constat|am v[ăa]zut|am identificat)\s+c[ăa](?!\p{L})/iu, label: 'deschidere de tip „am observat că”' },
  { pattern: /(?<!\p{L})prezen[țt][ăa](\s+\S+)?\s+online(?!\p{L})/iu, label: 'prezență online' },
  { pattern: /(?<!\p{L})[îi]n audit(?!\p{L})/iu, label: 'mențiunea „în audit”' },
  { pattern: /(?<!\p{L})analiz[ăa](?!\p{L})[^.?!]{0,40}complet|[«„"]da[»”"]/iu, label: 'promisiune de analiză / „răspundeți cu Da”' },
  { pattern: /(?<!\p{L})rat[ăa] de succes(?!\p{L})|\d+\s*%/iu, label: 'procent sau rată de succes' },
  { pattern: /^\s*salut/iu, label: 'salut informal' },
  { pattern: /(?<!\p{L})discu[țt]i[ea](?!\p{L})[^.?!]{0,30}15 minute/iu, label: 'cerere de discuție de 15 minute' },
  { pattern: /\?\s*$/u, label: 'încheiere cu o întrebare' },
];

export function bannedPhrase(text: string): string | null {
  return BANNED_PHRASES.find((b) => b.pattern.test(text))?.label ?? null;
}

/** „Lipsa unui...”, „nu aveți...”: afirmații despre firmă, permise doar cu o problemă reală din audit. */
const CLAIMS_A_GAP = /(?<!\p{L})(lips[aăe](?!\s+(unui\s+)?r[ăa]spuns)|nu ave[țt]i|nu exist[ăa]|nu dispune[țt]i)(?!\p{L})/iu;

/** Afirmația de 95% scurtată într-un DM își pierde sensul („avem 95%” din ce?). */
const BARE_STAT = /\d+\s*%|(?<!\p{L})rat[ăa] de succes(?!\p{L})/iu;

/**
 * Verificarea care nu poate fi lăsată pe seama promptului: fără probleme în
 * audit nu afirmăm lipsuri. Întoarce regula încălcată, pentru reîncercare.
 */
export function factualViolation(input: { email: string; auditIssues: number }): string | null {
  if (input.auditIssues === 0 && CLAIMS_A_GAP.test(input.email)) {
    return 'probleme_audit e gol, dar emailul afirmă că firmei îi lipsește ceva: scoate afirmația și propune direct sistemul';
  }
  return null;
}

/** Scoate din DM fraza cu cifra, fără un nou apel AI (DM-ul rămâne valid și mai scurt). */
export function withoutBareStat(dm: string): string {
  if (!BARE_STAT.test(dm)) return dm;
  const kept = (dm.match(/[^.!?]+[.!?]*\s*/g) ?? [dm]).filter((sentence) => !BARE_STAT.test(sentence));
  return kept.join('').trim() || dm;
}

/** Regulile comune de ton și structură, incluse în fiecare prompt care scrie mesaje către clienți. */
export const WRITING_RULES = `Cum scrii (obligatoriu):
- Prima frază: durerea clientului lor (durere_nisa) — o consecință concretă: pacienți/clienți/rezervări pierdute, cereri fără răspuns. E o situație frecventă în domeniu, nu un fapt despre firmă: formuleaz-o general („În clinicile stomatologice, multe cereri vin seara...”), nu ca o acuzație („clienții dumneavoastră nu primesc răspuns”). Nu descrie ce are deja firma sau site-ul ei (știe asta) și nu începe cu „Observ că” / „Am constatat că”.
- A doua frază leagă durerea de o problemă din probleme_audit (ce anume din audit o agravează), reformulată cu cuvintele tale — nu cita textul auditului, nu-l pune între ghilimele și nu scrie „în audit”. Dacă probleme_audit e gol, sari peste această frază: nu inventa o problemă a firmei.
- Ce oferim: un sistem profesional construit în jurul unui smart website modern. Când primești componente_lipsa, propune DOAR din ele (maximum două), niciodată ce apare în are_deja. componente_lipsa sunt ce poți propune, NU fapte despre firmă: nu afirma că firma nu are sau nu face ceva. Formulează natural, nu repeta aceeași formulă identic. Nu folosi niciodată „site rapid”, „site nou”, „potențial de creștere”, „prezență online”.
- Doar forma de politețe: „dumneavoastră”, „sunteți”, „răspundeți” — inclusiv în subiect și în DM-uri. Niciodată „tu”, „ești”, „poți”, „răspunde”.
- Încheierea NU e o întrebare de tip „V-ar interesa...?” / „Vă interesează...?”. Încheie cu afirmația de expertiză din dovezi_aprobate, redată complet și fidel (aceleași cifre, același sens; o poți lega de nișă, dar nu o scurta la „avem rată de succes X”; într-un DM, unde nu încape fidel, descrie metoda în câteva cuvinte, fără cifre). Mesajul se termină cu această afirmație: nu adăuga după ea alte oferte, promisiuni sau cereri (analize, audituri, rapoarte, „răspundeți cu Da”).
- Singurele cifre sau rezultate permise sunt cele din dovezi_aprobate și din datele primite. Nu inventa clienți, studii de caz, recenzii sau procente.
- Ton: sigur pe el, profesionist, concret, ca un specialist care a analizat deja cazul — nu ca un vânzător care cere permisiunea.`;

/** Același lead primește mereu aceeași afirmație; lead-uri diferite, afirmații diferite. */
function stableIndex(seed: string, length: number): number {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash % length;
}

/**
 * Contextul de poziționare trimis modelului alături de faptele firmei. Cu
 * `seed` (numele firmei) primește o singură afirmație de expertiză, ca mesajele
 * către lead-uri diferite să nu sune identic; fără seed (follow-up-uri), toate.
 */
export function positioningFacts(niche: string | null, seed?: string) {
  const proofs = seed ? [PROOF_POINTS[stableIndex(seed, PROOF_POINTS.length)]] : PROOF_POINTS;
  return { durere_nisa: nichePain(niche), dovezi_aprobate: proofs };
}

const GREETING = /^\s*bun[ăa] ziua[,!.]?\s*/i;

/** Mesajele către clienți încep cu „Bună ziua”; modelul îl omite uneori. */
export function withGreeting(text: string): string {
  if (!GREETING.test(text)) return `Bună ziua, ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  // „Bună ziua, În clinicile...”: după virgulă continuă fraza (numele de firme rămân cu majusculă)
  return text.replace(/^(\s*bun[ăa] ziua,\s*)(În|Pacien[țt]ii|Clien[țt]ii|St[ăa]pânii|Mul[țt]i|Multe|Oamenii|Turi[șs]tii|Antreprenorii)(?!\p{L})/iu, (_, greeting: string, word: string) => `${greeting}${word.charAt(0).toLowerCase()}${word.slice(1)}`);
}

/**
 * Emailul trebuie să înceapă cu fraza despre durere (first_line); modelul o
 * lasă uneori doar în first_line, iar corpul începe direct cu „această situație...”.
 */
export function withOpening(body: string, firstLine: string): string {
  const opening = firstLine.replace(GREETING, '').trim();
  const rest = body.replace(GREETING, '').trim();
  if (!opening || rest.toLowerCase().startsWith(opening.slice(0, 40).toLowerCase())) return withGreeting(body);
  return withGreeting(`${opening} ${rest}`);
}
