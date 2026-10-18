# AI Follow-Up & WhatsApp Automation

Modul multi-tenant (per organizație Clerk) pentru:

- **SMS automat la apel pierdut** — Twilio anunță CRM-ul, CRM-ul trimite SMS și creează lead-ul.
- **Auto-reply AI pe WhatsApp** — răspuns generat cu Groq (Llama 3.3 70B), doar dacă niciun
  operator uman nu a preluat conversația.
- **Ingest de lead-uri din site** (`agentie-digitala`) prin API key.

## 1. Baza de date

Rulează în Neon SQL Editor, după `setup-db.sql` și `setup-db-leads.sql`:

```
setup-db-followups.sql
```

Creează `organization_settings`, `conversations`, `conversation_messages` și extinde `leads`
cu `org_id`, `source`, `service_desired`, `source_ref` + statusurile `MISSED_CALL` / `WEB_FORM`.

## 2. Environment (utopia-crm)

```env
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=        # număr pentru SMS/voce
TWILIO_WHATSAPP_NUMBER=     # număr WhatsApp (sandbox sau aprobat), fără prefixul `whatsapp:`
GROQ_API_KEY=
NEXT_PUBLIC_APP_URL=https://utopia-crm.com
TWILIO_VALIDATE_SIGNATURE=true   # doar în producție
```

`TWILIO_VALIDATE_SIGNATURE` e `false` implicit: în spatele unui tunel (ngrok) sau al unui
preview deployment, URL-ul văzut de Next diferă de cel semnat de Twilio și webhook-ul ar
respinge cereri valide. Pornește-l după ce URL-ul din Twilio Console e cel final. Dacă
URL-ul semnat diferă de `NEXT_PUBLIC_APP_URL`, setează `TWILIO_WEBHOOK_BASE_URL`.

## 3. Configurare din UI

`/dashboard/follow-ups-ai` (link „AI Follow-Up" în sidebar). Prima încărcare creează
automat rândul de setări și API key-ul organizației.

| Câmp | Efect |
| --- | --- |
| **Activează SMS-ul automat** | Pornește SMS-ul la apel pierdut **și** SMS-ul de confirmare pentru lead-urile din site |
| **Mesaj SMS implicit** | Textul trimis. **Gol** → mesajul e generat de Groq la fiecare apel |
| **Activează răspunsurile automate** | Pornește auto-reply-ul AI. Oprit, mesajele se salvează în CRM fără răspuns |
| **Timp de așteptare agent uman** | Minute în care AI-ul tace după ce un operator preia conversația. `0` = AI-ul nu preia niciodată conversațiile marcate manual |
| **System Prompt** | Personalitatea și limitele AI-ului. Istoric: ultimele 20 de mesaje |

Tot acolo găsești, read-only, **Webhook URL** și **API Key**.

## 4. Twilio Console

Pe numărul tău, ambele câmpuri primesc **același** URL, metoda **POST**:

- Voice → *"A call comes in"* / status callback
- Messaging → *"When a message comes in"*

```
https://utopia-crm.com/api/webhooks/unified?orgId=<ORG_ID>
```

Handler-ul distinge evenimentele după payload: `CallStatus` → apel, `WaId`/`MessageSid` → mesaj.
Răspunde mereu cu TwiML gol (`<Response/>`) — mesajele pleacă prin REST API, nu prin TwiML.

### Idempotență

Twilio repetă webhook-urile la eroare. Nu se dublează nimic:

- lead-urile de apel pierdut folosesc `CallSid` ca `source_ref` (index unic);
- mesajele folosesc `MessageSid` ca `twilio_sid` (index unic parțial).

Un retry nu mai trimite al doilea SMS și nici al doilea răspuns AI.

## 5. Integrarea cu `agentie-digitala`

În site (`UTOPIA-SITE`):

```env
CRM_API_URL=https://utopia-crm.com
CRM_API_KEY=utk_...        # copiat din /dashboard/follow-ups-ai
```

`CRM_API_KEY` **nu** are prefix `NEXT_PUBLIC` — helper-ul `lib/crm.ts` se apelează doar din
server (route handlers / server actions), niciodată din browser.

`lib/bookingService.ts` îl apelează după salvarea rezervării în Neon, cu
`sourceRef = booking:<bookingId>`. `pushLeadToCrm` nu aruncă niciodată: dacă CRM-ul e
indisponibil, rezervarea rămâne validă și eroarea rămâne doar în loguri.

Pentru alt formular:

```ts
import { pushLeadToCrm } from '@/lib/crm';

await pushLeadToCrm({
  name: 'Ion Popescu',
  phone: '+40712345678',
  serviceDesired: 'Website de prezentare',
  sourceRef: `contact:${id}`, // opțional, pentru deduplicare
});
```

Contractul HTTP brut (`POST /api/leads`):

```jsonc
// request
{ "name": "...", "phone": "+40...", "serviceDesired": "...", "apiKey": "utk_..." }
// response
{ "success": true, "leadId": "uuid", "duplicate": false, "smsSent": true }
```

`apiKey` poate veni și din header-ul `x-api-key`.

## 6. Preluarea unei conversații de către un om

```http
GET  /api/followups/conversations
POST /api/followups/conversations/<id>/takeover   { "taken_by_human": true }
```

Cât timp preluarea e activă (în fereastra `human_takeover_minutes`), webhook-ul nu mai
generează răspunsuri AI pentru acea conversație. `{ "taken_by_human": false }` o eliberează.

## 7. Rute adăugate

| Rută | Rol |
| --- | --- |
| `/dashboard/follow-ups-ai` | UI de configurare |
| `GET·PUT /api/settings/followup` | Citește/salvează setările organizației |
| `POST /api/settings/followup/rotate-key` | Regenerează API key-ul |
| `POST /api/webhooks/unified` | Webhook unificat Twilio (public, autentificat prin orgId/apiKey + semnătură) |
| `POST /api/leads` | Ingest din site (apiKey) + adăugare manuală (sesiune Clerk) |
| `GET /api/followups/conversations` | Lista conversațiilor |
| `POST /api/followups/conversations/[id]/takeover` | Preluare/eliberare de către un operator |

`/api/webhooks/unified` și `/api/leads` sunt publice în `middleware.ts` (Twilio și site-ul nu
au sesiune Clerk). `GET /api/leads` își verifică singur sesiunea în handler, iar sub-rutele
(`/api/leads/scan`, `/api/leads/[id]`) rămân protejate de middleware.
