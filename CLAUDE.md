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
- `lib/llm.ts` — `generateJSON({ system, prompt, images?, schema })` (current providers: OpenRouter/DeepSeek via `lib/openai-compat.ts` `chatJSON()`, order from `LLM_PROVIDERS`, default `openrouter,deepseek`; routes with no key/model are skipped; a route failing with 429/502/503/504/timeout/network is retried once after 3 s (or its Retry-After if 1-5 s; longer skips the retry), then rests 10 s (`LLM_RETRY_DELAY_MS`, `LLM_RETRY_ATTEMPTS`, `LLM_ROUTE_COOLDOWN_MS`) while the next route is used; 400/401/402/403/404/unreadable skip the retry; each call is cut off after `LLM_CALL_TIMEOUT_MS` (15 s) and one request stops trying routes after `LLM_TOTAL_BUDGET_MS` (50 s, retry waits included) so the error arrives before the 60 s route limit; no whole-list retry, final error "AI is busy, try again"; logic in `runRoutes()`, tested by `npm run check:retry` (mocked, no provider calls); DeepSeek text only; models from `OPENROUTER_MODEL`, `OPENROUTER_VISION_MODEL`, `OPENROUTER_FALLBACK_MODELS`, `OPENROUTER_VISION_FALLBACK_MODELS`, `DEEPSEEK_MODEL`; `npm run check:providers` = one text call per provider; Gemini is optional and off by default). Gemini path, still available if "gemini" is in LLM_PROVIDERS: (inline base64 images) via `lib/gemini-client.ts` `withGemini()` (keys GEMINI_API_KEY / _2 / GEMINI_API_KEYS, failover on quota/5xx, exhausted keys skipped in memory for retryDelay); Groq text fallback (`GROQ_CHAT_MODEL`); failures throw `AiError` with a user-safe message. Models in `lib/config.ts` (env overrides: GEMINI_MODEL, GEMINI_VISION_MODEL, GEMINI_FALLBACK_MODELS, GROQ_*); defaults gemini-3.8-flash then gemini-3.7-flash (exact names, probed on both keys); routes = key x model, last good route first, 404 skips a route, 5xx/network makes it rest for `LLM_ROUTE_COOLDOWN_MS`, one 1.5 s retry pass then "AI is busy"; `npm run check:models` lists Groq models, `npm run check:gemini-models` lists Gemini models per key. If AI fails after transcription, consult saves the transcript as an empty draft note.
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
- `lib/records.ts` — `buildPatientContext(patientId)`: approved-only records as one line per item with short source ids (P/A/D/M/L/N/E) -> `{ text, sources }`; oldest encounters dropped over ~25k tokens.
- `app/api/ask/route.ts` — POST {patientId, question | mode:"summary"}: one cited Gemini call, then server-side check (unknown ids dropped, numbers must appear in cited source) -> statements with `verified`. Audit 'ask'. `components/AskMedora.tsx` — card on the patient page.
- `lib/permissions.ts` — the one role matrix: `PERMISSIONS`, `can(role, action)`. Used by server actions, API routes and UI. `lib/roles.ts` — `currentRole(supabase)`. `npm run permissions-table` regenerates the README roles table from the matrix.
- `app/(app)/audit` — doctor-only audit log (latest 300, filters action/user/patient via search params; nurses redirected to /patients with a notice). `components/AuditBadge.tsx` — action/role badges. Patient page has a doctor-only "Access log" card (last 10).
- `supabase/phase7.sql` — append-only audit_log policies (insert own rows, doctors select, no update/delete); run manually, rollback included. Audit reads use the signed-in doctor's client, never the service role.

- `supabase/phase8.sql` — `tasks` table (id, patient_id, note_id, title, kind test|medication|follow_up|advice, due_date, status draft|open|done|dismissed, source_refs jsonb, created_at, confirmed_by/at, completed_by/at; unique (note_id, title); same open RLS as other patient tables); run manually, rollback in header.
- `lib/tasks.ts` — `draftTasksFromPlan()`: one generateJSON call turns the approved Plan into 'draft' tasks (one per statement, idempotent per note_id, never throws; failures logged). Called from `approveNote`. Audit `task.draft_created`.
- `app/(app)/patients/[id]/tasks-actions.ts` — server actions confirmTask/dismissTask (doctor) and completeTask (doctor, nurse) via `can('task.*')`; audit `task.confirm|dismiss|complete`. `components/TasksCard.tsx` — Follow-up tasks card (AI draft, Overdue tag, Completed toggle).
- `app/api/brief/route.ts` + `components/PreVisitBrief.tsx` — POST {patientId}: AI writes only last visit + max 3 discussion points (cited, verified like Ask); trends (`lib/trends.ts`), safety alerts (`lib/safety.ts`) and open tasks come straight from code. Audit `brief.generate`. Printable card.
- Handwritten prescriptions: `lib/extract.ts` asks for per-field confidence (`field_conf`, `date_confidence`, `prescriber_confidence`) and the literal "illegible", and keeps the AI reading in `ai_original`. `lib/drug-match.ts` `suggestDrugs()` (fuzzy "Did you mean", never auto-replaces; uses `knownDrugNames()` from `lib/safety.ts` + the patient's meds). `ReviewForm` highlights flagged fields (`medFlags()` in `lib/validate.ts`); each must be edited or ticked, illegible ones must be edited. `approveDocument` rejects leftover "illegible", runs the safety rules and logs `lib/review-diff.ts` `diffReading()` in `audit_log.details` (`supabase/phase9.sql`; `logAudit` falls back to no details if the column is missing). Test cases: `samples/handwritten/README.md`.
- `lib/care-gaps.ts` — pure `careGaps({ today, encounters, medications, labs, tasks })`: rule-based prompts (HbA1c overdue / above target without recheck, raised BP without recheck [parsed from visit summaries], kidney-sensitive medicine without recent creatinine/eGFR, worsening trend without follow-up, abnormal result not repeated). Each gap has rule, message, `why` (exact data used) and evidence with timeline focus ids. `components/CareGaps.tsx` — card on the patient page and in the pre-visit brief. No AI. `scripts/seed-data.ts` holds the demo patients; `npm run check:care-gaps` prints the gaps per seeded patient (no database).
- `lib/fhir.ts` — `buildBundle()`: FHIR R4 collection Bundle (Patient, AllergyIntolerance, Condition from approved-note assessments only, MedicationRequest, Observation with valueQuantity; LOINC only for ten certain tests, UCUM codes from a small map; no meta.profile; disclaimer in meta.tag) + `stableUuid()`. `app/api/fhir/[patientId]/route.ts` — doctor-only GET (`export_fhir`), 401/403, audit `fhir.export`, download button + disclaimer on the patient page. `npm run fhir:check` validates seeded patients structurally and posts them to the public HAPI `$validate` (synthetic data only).
