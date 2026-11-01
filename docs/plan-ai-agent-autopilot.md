# Plan — Autopilot leaduri + outreach fără spam, controlat din „AI Agent”

## Context
Azi, găsirea de leaduri și outreach-ul depind de 5 joburi cron separate (`/api/cron/lead-discover`, `lead-enrich`, `outreach-plan`, `outreach-send`, `inbox-sync`). Setările lor sunt împrăștiate între `.env` și 3 tabele (`engine_settings`, `outreach_settings`, `organization_settings`). Emailurile pleacă de pe Gmail-ul personal, cu pixel de urmărire, fără tratarea bounce-urilor și fără verificarea adreselor. Asta e riscul principal de spam și de blocare a contului. Modelul AI e fixat în cod, în 3 locuri diferite.

**Scopul:** un singur flux automat zilnic, sigur pentru livrabilitate:
găsire → ICP score → campanie automată pe reguli → trimitere treptată → răspunsuri.

Fluxul se configurează și se monitorizează din pagina **AI Agent** (fosta „AI Follow-Up”). Pagina are:
- alegerea modelului AI pentru fiecare proces;
- condițiile campaniilor automate;
- un **widget în header** care deschide un panou lateral în care îi dai instrucțiuni agentului.

**Deciziile tale:**
- **Expeditor:** domeniu secundar dedicat, încălzit treptat.
- **Agent:** citește liber, iar acțiunile care schimbă ceva cer confirmarea ta.
- **Modele AI:** Groq, plus Anthropic și OpenAI cu cheile tale.

---

## Audit pattern-uri (zona: automatizare, outreach, AI)

| # | Pattern | Status | Dovezi | Problema | Prio |
|---|---|---|---|---|---|
| 1 | Repository | PARȚIAL | `services/*/repository.ts` există; SQL direct în `app/api/leads/[id]/outreach/route.ts:24`, `services/messages/replies.ts:70` | Interogări puțin duplicate, fără impact acum | P2 |
| 2 | Factory | LIPSĂ – NECESAR | Client AI construit în 3 feluri: `engine/groq.ts:11-12` (gpt-oss, din env), `followups/ai.ts:3-4` și `leads/pitch.ts:87-94` (llama, fixat în cod); transport nodemailer creat în 4 locuri (`lib/messaging.ts:7`, `actions/send-emails.ts:26,81`, `api/send-review-emails/route.ts:7`) | Alegerea modelului pe proces nu se poate face fără un punct unic de creare | **P1** |
| 3 | Singleton / config | PARȚIAL | `lib/neon.ts` corect (o singură instanță `sql`); setările de automatizare se citesc din env în 12 fișiere (`outreach/schedule.ts` `dailyCap`, `allowedRecipients`, `isSendingEnabled`; `engine/repository.ts:42`; `engine/groq.ts:28`) | Nu se pot configura din UI; se citesc diferit în fiecare fișier | **P1** |
| 4 | Strategy | PARȚIAL | Sursele de găsire sunt un lanț de `if` (`engine/run.ts:78-87`); alegerea canalului e un lanț de `if` (`outreach/plan.ts` `firstStep`) | Agentul și UI-ul nu pot porni sau opri sursele și joburile ca date | P1 (joburi) / P2 (surse) |
| 5 | Observer / coadă | PARȚIAL | `pipeline_events` e un jurnal de evenimente bun, dar efectele secundare sunt apelate secvențial (`outreach/inbox.ts`, `outreach/direct.ts`); nu există coadă de joburi | Acțiunile lungi cerute de agent (ex. 6 combinații de discover) nu au unde rula | **P1** |
| 6 | Builder | LIPSĂ – OK | Prompturile sunt constante (`engine/score.ts:12`) | Un obiect de opțiuni tipizat ajunge; un registru simplu de prompturi pentru instrucțiunile permanente | — |
| 7 | Adapter | PARȚIAL | Sursele de găsire se normalizează corect la `EngineCandidate`; răspunsul Groq e parsat în 3 locuri; IMAP e legat de Gmail (`gmraw`, `\All`, `replies.ts:117,212`) | Schimbarea furnizorului AI sau a căsuței ar atinge multe fișiere | **P1** |
| 8 | Decorator | PARȚIAL | `requirePipelineOwner()` repetat în 16 rute; `checkCronSecret` în 5; același `try/catch + console.error` peste tot | Duplicare; rutele noi (agent, tick) ar mări-o | P2 |
| 9 | CQRS | LIPSĂ – OK | KPI-urile și fațetele se calculează pe 467 de rânduri (`pipeline/repository.ts` `listPipelineLeads`) | Volum mic; un SQL separat pentru monitorizare ajunge | — |
| 10 | Circuit Breaker | **LIPSĂ – NECESAR** | Trimiterea nu are oprire automată: niciun cod pentru bounce sau `mailer-daemon` în `src`; `followups/ai.ts` și `leads/pitch.ts` nu au timeout; pixelul e pus mereu (`outreach/email.ts:65-68`) | Dacă reputația scade, jobul continuă să trimită până la blocare. **Risc de producție** | **P0** |

**Supraaplicat:** nimic semnificativ. Nu recomand CQRS complet și nici container de dependency injection.

---

## Arhitectura țintă

```
cron-job.org (1 job, la 5 min) ──► /api/cron/tick ──withCron──►
  Scheduler (Strategy: registru de joburi + advisory lock)
    ├─ discover    (fereastra 07–10, până la plafonul zilnic)
    ├─ icp_score   (cât are coada SOURCED)
    ├─ auto_plan   (reguli campanie → runOutreachPlan cu CampaignBatch)
    ├─ send        (L–V 9–17, plafon de încălzire, pauză aleatoare) ─► SendBreaker (Circuit Breaker)
    ├─ inbox       (răspunsuri + BOUNCE) ─► breaker
    └─ agent_jobs  (coadă: acțiuni lungi confirmate)
  config: getAutomationConfig()  (DB întâi, env ca rezervă)  [Singleton per invocare]
  AI:     aiFor(proces) ─► Factory ─► Adapter (OpenAI-compatibil: Groq/OpenAI | Anthropic) + timeout/breaker
  jurnal: automation_runs + pipeline_events

Header ► AgentWidget (panou lateral) ► /api/agent/chat ──withOwner──►
  aiFor('agent') + apelare de unelte (registru zod) ─► citire: execută direct
                                                   └─► scriere: agent_actions „propusă” ─► Confirmă ─► serviciu sau agent_jobs
```

---

## Faze (fiecare se livrează separat: un commit pe fază; SQL rulat în Neon doar cu OK-ul tău)

### Faza 0 — Raport
- Scrie auditul de mai sus în `docs/architecture-audit.md`.

### Faza 1 — Fundație (P1: Factory + Adapter + config + Decorator)
- **`src/services/ai/`**
  - `types.ts`: `AiProvider { completeJson(req), chat(req, tools) }`; `AiProcess = 'icp_score' | 'followups' | 'reply_classify' | 'rewrite' | 'lead_pitch' | 'whatsapp' | 'agent'`.
  - `providers/openai-compatible.ts`: acoperă Groq și OpenAI (același API). Mută aici logica din `engine/groq.ts`: schema strictă, `retry-after`, `GroqRateLimitError` → `AiRateLimitError`, timeout.
  - `providers/anthropic.ts`: SDK oficial `@anthropic-ai/sdk`. **Înainte de implementare se încarcă skill-ul `claude-api`**, pentru ID-urile de model și apelarea de unelte.
  - `registry.ts`: `aiFor(process)` citește `ai_settings` (furnizor + model pe proces) și cheile din env (`GROQ_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`). `listModels(provider)` citește `/models` de la fiecare furnizor, cu cache.
  - Breaker simplu pe furnizor: 3 eșecuri → OPEN 60 s → HALF-OPEN.
  - Apelurile existente se mută pe `aiFor(...)`: `engine/score.ts`, `outreach/ai.ts` (follow-up-uri, clasificare, rescriere), `followups/ai.ts`, `leads/pitch.ts`. Modelul implicit rămâne cel de azi, deci comportamentul nu se schimbă.
- **`src/services/automation/config.ts`**: `getAutomationConfig()` (rând din DB, cu valorile din env ca rezervă). Înlocuiește citirile directe: `dailyCap`, `allowedRecipients`, `isSendingEnabled` (`outreach/schedule.ts`) și `effectiveMaxNewPerDay` (`engine/repository.ts`).
- **`src/lib/route-guards.ts`**: `withOwner(handler)`, `withCron(handler)` (autentificare, log, `try/catch` uniform). Se folosesc în toate rutele noi; cele vechi se mută treptat.
- **SQL (`setup-db-agent.sql`, partea 1):**
  - `automation_settings` (un singur rând, coloane tipizate și JSONB pentru reguli);
  - `ai_settings` (proces → furnizor, model).

### Faza 2 — Livrabilitate (P0: Circuit Breaker pe trimitere), obligatorie înainte de pornirea pe leaduri reale
- **Infrastructură (la tine, ghid pas cu pas în UI):**
  - Domeniu secundar, ~10 €/an.
  - Căsuță **Google Workspace**, ~7 €/lună. Recomandat pentru că sincronizarea folosește deja căutarea Gmail. Alternativa e Zoho Mail Lite, ~1 €/lună, dar cere adaptorul IMAP standard de mai jos.
  - SPF, DKIM, DMARC (`p=none` la început).
- **Adaptor pentru căsuță:** `src/services/messages/mailbox.ts`, cu credențiale SMTP/IMAP din env (`OUTREACH_SMTP_*`, `OUTREACH_IMAP_*`). Varianta Gmail folosește `gmraw`; varianta standard folosește `SEARCH FROM`. Outreach-ul trimite de pe căsuța dedicată, iar emailurile de sistem rămân pe adresa actuală.
- **Încălzirea:** plafonul zilnic = `min(țintă, start + pas × zile de la începerea încălzirii)`, de exemplu 10 → +3/zi → 40. Se calculează în `getAutomationConfig`.
- **Primul email „curat”:** text simplu, fără link-uri. **Fără pixel** implicit (setarea `track_opens`; deschiderile sunt oricum nesigure, din cauza Apple Mail Privacy). Headerele de dezabonare RFC 8058 rămân.
- **Verificare înainte de trimitere:** `dns.resolveMx` (gratuit, `node:dns`). Fără MX → pasul nu pleacă, iar adresa e marcată `email_status='invalid'`.
- **Bounce-uri:** în `runInboxSync`, mesajele de la `mailer-daemon` sau `postmaster` se leagă de Message-ID-ul original. Pasul trece pe `bounced`, adresa devine invalidă, secvența se oprește.
- **`SendBreaker`** (`src/services/outreach/breaker.ts`):
  - **OPEN** dacă rata de bounce pe 7 zile depășește 3%, la 3 eșecuri SMTP consecutive, sau la un val de dezabonări.
  - În starea OPEN, `runOutreachSend` nu trimite, iar UI-ul arată motivul.
  - **HALF-OPEN** după reluarea manuală, cu plafonul înjumătățit.
- **O singură adresă de contact per firmă** (după domeniul emailului sau după `website`). Lista de excludere globală: DO_NOT_CONTACT plus adresele dezabonate.
- **Canale non-email:** Instagram, LinkedIn și Facebook rămân **manuale, asistate** (lista „Outreach azi”), pentru că termenii platformelor interzic automatizarea mesajelor directe. WhatsApp și SMS reci nu se automatizează (politica Meta cere opt-in și template-uri aprobate).
- **SQL (partea 2):** `leads.email_status`, `outreach_tasks.bounced_at`, starea breaker-ului în `automation_settings`.

### Faza 3 — Autopilot (Strategy pe joburi + coadă)
- **`src/services/automation/scheduler.ts`:** registrul joburilor `{ key, isDue(config, lastRun, now), run(budgetMs) }` pentru discover, icp_score, auto_plan, send, inbox și agent_jobs.
  - Fiecare tick rulează cel mai urgent job scadent, sub `pg_try_advisory_lock`, ca să nu se suprapună rulări.
  - Refolosește: `runDiscover` / `nextDiscoverPair` (`engine/run.ts`, `engine/repository.ts`), `runEnrich`, `runOutreachPlan(budget, CampaignBatch)` (`outreach/plan.ts`), `runOutreachSend` (`outreach/send.ts`), `runInboxSync` (`outreach/inbox.ts`).
- **`/api/cron/tick`** (cu `withCron`, `waitUntil`, 202). Rutele cron vechi rămân ca învelișuri subțiri; pe cron-job.org rămâne un singur job.
- **Campanie automată:** regulile din `automation_settings.auto_campaign` (`CampaignFilters` plus segment, scor minim, leaduri pe zi) intră în `runOutreachPlan`, cu planificarea limitată la plafonul de încălzire.
- **SQL (partea 3):**
  - `automation_runs` (job, declanșator, start, final, contoare, erori), care înlocuiește treptat `engine_runs`, păstrat pentru istoric;
  - `agent_jobs` (coada: tip, payload, stare, încercări).

### Faza 4 — Pagina AI Agent
- `/dashboard/follow-ups-ai` → **`/agent`**, cu redirecționare de pe ruta veche. În meniu, „AI Follow-Up” → „AI Agent”.
- **Tab-uri:**
  1. **Autopilot:** comutator pe fiecare job, ferestre orare, rotația nișe × orașe, plafoane, scor minim, regulile campaniei automate (refolosește `MultiValueInput` și filtrele din `CampaignPanel`), legătura spre modelele pașilor.
  2. **Livrabilitate:**
     - verificări DNS live: SPF, DKIM, DMARC, MX ale domeniului (`dns.resolveTxt`);
     - starea încălzirii, rata de bounce și de răspuns, starea breaker-ului și butonul „Reia”;
     - modul test (`OUTREACH_ALLOWED_RECIPIENTS`).
  3. **Modele AI:** pentru fiecare proces, alegi furnizorul și modelul (din `listModels`), cu buton „Testează”.
  4. **Monitorizare:** contoarele de azi (găsite, scorate, planificate, trimise, răspunsuri, bounce-uri), pâlnia și jurnalul `automation_runs` cu erorile.
  5. **Instrucțiuni permanente:** text adăugat în promptul agentului și, opțional, în pitch, de exemplu tonul și ofertele de evitat.
  6. **WhatsApp & follow-up:** formularul existent `FollowUpSettingsForm`, neschimbat.
- **API-uri:** `/api/agent/settings` (GET/PUT, `withOwner`, zod) și `/api/agent/models`.

### Faza 5 — Widget agent în header
- **`src/components/agent/AgentWidget.tsx`:** buton „Agent” în `Header.tsx` (lângă căutare), care deschide un `Sheet` lateral cu chat, istoric de conversații și carduri de acțiune („Confirmă” / „Respinge”).
- **`/api/agent/chat`** (`withOwner`): bucla de apelare a uneltelor prin `aiFor('agent')`, maximum 6 pași, cu buget de timp; mesajele se salvează.
- **`src/services/agent/tools.ts`:** registru (Strategy și Command) cu schemă zod pe fiecare unealtă.
  - **Citire** (se execută direct): `search_leads` (`listPipelineLeads`), `get_lead` (`getPipelineLead` + `getLeadTimeline`), `pipeline_stats`, `campaign_audience` (`getCampaignAudience`), `automation_status`, `recent_runs`, `recent_replies`.
  - **Scriere** (devin un rând `agent_actions` în starea `proposed`): `run_discover(niches, cities)`, `run_icp_score`, `plan_campaign(filters, limit)`, `send_now`, `update_automation_settings(patch)`, `set_lead_stage`, `pause_autopilot` / `resume_autopilot`, `draft_message` (doar ciornă).
- **`/api/agent/actions/[id]`** (confirmare sau respingere): acțiunile scurte rulează direct; cele lungi intră în `agent_jobs`, procesate de tick. Rezultatul revine în conversație.
- **Siguranță:**
  - doar owner;
  - textele de la leaduri (răspunsuri) se dau modelului ca date marcate, nu ca instrucțiuni;
  - rezultatele uneltelor se trunchiază;
  - fiecare acțiune intră în jurnal (autor, payload, rezultat).
- **SQL (partea 4):** `agent_conversations`, `agent_messages`, `agent_actions`.

### Faza 6 — Curățenie (P2)
- Rutele vechi mutate pe `withOwner` / `withCron`.
- Un singur creator de transport SMTP.
- Registru pentru sursele de găsire, ca să poată fi pornite și oprite din Autopilot.
- SQL-ul direct din rute mutat în repository-uri.

---

## Fișiere critice
- **Noi:**
  - `src/services/ai/*`, `src/services/automation/{config,scheduler}.ts`, `src/services/outreach/breaker.ts`, `src/services/messages/mailbox.ts`, `src/services/agent/*`;
  - `src/lib/route-guards.ts`, `src/app/api/cron/tick/route.ts`, `src/app/api/agent/*`;
  - `src/app/(dashboard)/agent/page.tsx`, `src/components/agent/*`;
  - `setup-db-agent.sql`, `docs/architecture-audit.md`.
- **Modificate:**
  - `engine/score.ts`, `outreach/{ai,send,inbox,plan,schedule,email}.ts`, `followups/ai.ts`, `leads/pitch.ts`, `engine/repository.ts`;
  - `messages/replies.ts`, `components/Header.tsx`, `components/Sidebar.tsx`, `dashboard/follow-ups-ai/page.tsx` (redirecționare).

## Costuri noi
- Domeniu: ~10 €/an.
- Căsuța: Google Workspace ~7 €/lună (sau Zoho Lite ~1 €/lună).
- Anthropic / OpenAI: plătești doar ce folosești. Groq rămâne implicit, gratuit.

## Verificare (pe fiecare fază)
- `npx tsc --noEmit` după fiecare pas.
- **Faza 1:** scorez un lead real cu Groq prin `aiFor('icp_score')` (script `jiti`, ca la reproducerea erorii „pachet de start”). Comut modelul din `ai_settings` și verific că se schimbă.
- **Faza 2:** în modul test (`OUTREACH_ALLOWED_RECIPIENTS`):
  - trimit spre adresa de test → verific în Gmail headerele SPF/DKIM `pass` („Show original”) și lipsa pixelului;
  - trimit spre o adresă inexistentă → bounce detectat, adresă `invalid`, breaker numărat;
  - forțez 3 eșecuri → breaker OPEN și trimiterea oprită.
- **Faza 3:** apelez local `POST /api/cron/tick` cu `CRON_SECRET`; în `automation_runs` apare rotația joburilor. Două tick-uri simultane → al doilea e sărit (lock).
- **Faza 4:** schimb setările în UI; tick-ul următor le respectă (fereastră, plafon, filtrele campaniei).
- **Faza 5:** în widget:
  - „câte leaduri dentist în Oradea au scor 70+?” → unealtă de citire, răspuns corect;
  - „rulează new leads pentru dentist și veterinar în Oradea și Cluj” → card de confirmare → job în coadă → rezultat în chat.
  - Un răspuns de la un lead care conține instrucțiuni nu declanșează acțiuni.
- Deblocarea trimiterii reale (`OUTREACH_ALLOWED_RECIPIENTS` gol) se face doar după ce Faza 2 trece și domeniul e încălzit.
