# Medora
AI-native EMR for a 4-day hackathon (The Industry Games 2026, District 04). Solo developer, demo quality.
Tagline: "AI drafts. Doctors decide."

## Stack
- Next.js App Router, TypeScript, Tailwind. Supabase (Postgres, auth, storage).
- AI is free-tier only: Google Gemini API (Flash) for lab-report extraction, SOAP notes and cited Q&A, using JSON-schema structured output. Groq whisper for transcription. Groq text model as fallback when Gemini returns 429.
- No vector DB. For search, send one patient's records with IDs in the prompt and require cited answers.

## Principles
- AI output is always a DRAFT that a clinician reviews and approves before it is saved.
- Every AI-derived fact keeps a link to its source document or note.
- Log views, edits and approvals in audit_log.
- Synthetic data only, never real patient data.

## Roles
doctor, nurse.

## Credits (for README)
Scribe ideas inspired by OpenScribe (MIT).

## Rules
Keep code simple, small files, no over-engineering, no tests unless asked, no new dependencies without asking.

## Structure
- `proxy.ts` — Next 16 proxy: refreshes Supabase session, redirects unauthenticated users to /login.
- `lib/supabase/server.ts` / `client.ts` — `createClient()` for server (async, cookies) and browser.
- `lib/audit.ts` — `logAudit({ action, entityType, entityId, patientId })` inserts into audit_log.
- `lib/timeline.ts` — pure `buildTimeline()` merging encounters, labs (grouped by date), meds, documents, notes; `isOutOfRange()`, `formatRange()`; labs carry `prev` (previous value of same test).
- `lib/utils.ts` — `ageFromDob()`.
- `app/login` — login page (demo fill buttons). `app/(app)/` — shell layout with `components/Header.tsx`.
- `app/(app)/patients` (list), `patients/[id]` (patient page), `upload` and `consult` placeholders.
- `components/` — Header, LogoutButton, PatientList, Timeline.
- `lib/llm.ts` — `generateJSON({ system, prompt, images?, schema })`: Gemini (inline base64 images), Groq text fallback on 429.
- `lib/extract.ts` — `extractDocument(image, mimeType)`: Gemini vision -> raw `Extraction` (lab results / medications), transcribe-only.
- `lib/validate.ts` — `validateExtraction()`: canonical test names, computed H/L/N flag, per-row `issues` + `status` ok|check.
- `scripts/test-extract.ts` — `npm run test-extract`: runs sample-docs/* through extract+validate, prints tables, saves JSON to sample-docs/out/.
