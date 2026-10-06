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
- `lib/validate.ts` also exports `validateLab/validateMed/computeFlag/canonicalName` (pure, used client-side); name lookup: full -> no parentheses -> no qualifiers.
- `app/api/extract/route.ts` — POST {documentId}: download image, extract+validate, save to documents.extracted_json, audit 'extract'.
- `app/(app)/patients/[id]/upload` + `components/UploadForm.tsx` — resize (canvas), upload to 'documents' bucket, insert draft row, call /api/extract.
- `app/(app)/patients/[id]/documents/[docId]` — review page (`components/ReviewForm.tsx`) + `actions.ts` server actions saveDraft/approveDocument (doctor only)/discardDocument. Approve writes lab_results (flag stored as high/low/normal) or medications.
- `lib/scribe.ts` — scribe types (`NoteContent`, `Segment`, `MedChange`), `splitTranscript()`, `draftNote()` (one Gemini call: speakers + cited SOAP + med_changes), `transcriptText()`.
- `app/api/consult/route.ts` — POST multipart {patientId, audio | transcriptText}: Groq whisper (verbose_json, audio never stored) -> draftNote -> clinical_notes draft, audit 'create_note'.
- `app/(app)/patients/[id]/consult` + `components/ConsultForm.tsx` — consent gate, record/upload/paste tabs, 3-step progress.
- `app/(app)/patients/[id]/notes/[noteId]` — note review page (`components/NoteReview.tsx`) + `actions.ts` saveNoteDraft/approveNote (doctor only; creates encounter, applies ticked med changes, redirects with ?notice=)/discardNote.
- `lib/safety.ts` — pure: `normalizeDrug()` (brand->generic), `parseDailyDoseMg()`, `checkSafety()` -> alerts (allergy, duplicate, renal, potassium, ~40 curated interactions; demo subset). `lib/safety-context.ts` loads its inputs for a patient.
- `components/SafetyAlerts.tsx` — alert list used on patient page, prescription review (live, new rows only, critical needs "reviewed" tick) and note review (with ticked changes applied).
- `lib/trends.ts` — pure `groupSeries()`, `trendInsights()` (3+ results moving worse). `components/TrendsCard.tsx` — recharts line charts with reference band.
