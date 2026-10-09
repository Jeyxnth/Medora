# Medora: AI drafts. Doctors decide.

Medora is an AI-native EMR for clinical assistance, built for The Industry Games 2026, District 04 (Qualacs-I). It reads lab reports and prescriptions, turns consultations into cited SOAP notes, answers questions about a patient with links to the source record, and flags medication risks. Nothing the AI produces is saved until a doctor reviews and approves it.

Team J2.exe: Jasmine Kaur and Jeyanth S.

Live demo: https://medora-inky.vercel.app

All data in this project is synthetic. No real patient data is used or should be entered.

## The problem

Clinicians spend a large share of their day on documentation, and a patient's history is spread across scanned reports, outside prescriptions, past notes and memory. Studies from the United States report that documentation time is a major driver of clinician burnout; those figures come from US settings and may not match Indian practice. Medora targets both halves: less typing, and one place where every fact can be traced back to its source.

## Features

| Arena objective | Medora feature |
| --- | --- |
| Documentation and scribing | Consultation page with a consent gate. Record audio, upload an audio file, or paste a transcript. Groq Whisper transcribes (audio is never stored); Gemini drafts a SOAP note where every statement cites transcript lines, plus suggested medication changes. |
| Document extraction | Upload a lab report or prescription photo. Gemini reads it into structured rows, then a rules step normalizes test names, recomputes the high/low flag, and marks rows that need a check. A name-mismatch warning appears if the document is for another patient. |
| Timeline | One chronological patient timeline of encounters, labs (grouped by date, with the previous value), medications, documents and notes, with type filters. |
| Natural-language search | Ask Medora: free-text questions over one patient's approved records. |
| Summaries | "Summarize patient" in Ask Medora, and a printable pre-visit brief. |
| Trends | Line charts per lab test with the reference range shaded. An insight appears when a test has moved in the worse direction across three or more results. |
| Medication and record consistency | A rules-based safety check for allergy conflicts, duplicate drugs, kidney-related dose concerns, potassium risk and a curated set of interactions. It runs on the patient page, on prescription review and on note review (with the ticked changes applied). |
| Evidence-backed answers | Every Ask answer statement cites source records. A server-side check drops unknown source ids and marks a statement "could not be verified" if its numbers or dates are not in the cited record. |
| Role-based access and audit | Doctor and nurse roles from a single permissions matrix, enforced in server actions and API routes. An append-only audit log records views, edits, approvals, questions and task actions. |
| Workflow automation | When a doctor approves a note, the Plan is turned into draft follow-up tasks. A doctor confirms or dismisses each one; doctors and nurses can mark confirmed tasks done. The pre-visit brief combines the last visit, key trends, active safety alerts, open tasks and up to three suggested discussion points. |

## How it works

1. A document or consultation goes in. The AI produces a draft: extracted values, a SOAP note, a task list, an answer or a brief.
2. A clinician reviews the draft. Flagged rows must be ticked as checked, critical safety alerts must be acknowledged, and the source image or transcript sits beside the draft.
3. Only a doctor's approval writes to the record (lab results, medications, encounters, tasks). Drafts are never used for answers, trends or alerts.
4. Every AI-derived fact keeps a link to its source document or note. Ask and the brief verify numbers against the cited source.
5. Views, edits, approvals, questions and task actions are logged. The audit log has insert and read policies only, so rows cannot be changed or deleted.

Safety checks are a plain TypeScript rules engine (`lib/safety.ts`) with no AI involved. Trends in the brief and the alert list also come from code, not from the model.

There is no vector database. For each question, one patient's approved records are sent in the prompt with short source ids, and the model must cite them.

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router) |
| UI | React 19, TypeScript, Tailwind CSS |
| Charts and icons | Recharts, lucide-react |
| Database, auth, storage | Supabase (Postgres with row-level security, Auth, Storage) |
| Extraction, notes, Q&A | Google Gemini Flash (`GEMINI_MODEL`, default `gemini-3.8-flash`, fallback `gemini-3.7-flash`) |
| Transcription | Groq Whisper (`GROQ_WHISPER_MODEL`, default `whisper-large-v3-turbo`) |
| Text fallback | Groq chat model (`GROQ_CHAT_MODEL`, default `openai/gpt-oss-120b`), used when every Gemini key is out of quota. `npm run check:models` lists valid ids |
| Hosting | Vercel |

## Getting started

Prerequisites: Node.js 20 or later, a Supabase project, a Google AI Studio API key (Gemini) and a Groq API key. Both AI services have free tiers.

```bash
git clone https://github.com/Jeyxnth/Medora.git
cd Medora
npm install
```

1. Create a Supabase project.
2. In the Supabase SQL editor, run the files in `supabase/` in this order:
   1. `schema.sql` (tables, row-level security, and the private `documents` storage bucket with its policy)
   2. `phase7.sql` (append-only audit log policies)
   3. `phase8.sql` (follow-up tasks table)
3. No manual bucket setup is needed; `schema.sql` creates the `documents` bucket.
4. Copy `.env.local.example` to `.env.local` and fill in your own values:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # used only by the seed script
GEMINI_API_KEY=your-gemini-key
GEMINI_API_KEY_2=optional-second-gemini-key   # failover on quota errors (or GEMINI_API_KEYS=a,b,c)
GEMINI_MODEL=optional-override
GEMINI_VISION_MODEL=optional-override   # used for images (document reading)
GROQ_API_KEY=your-groq-key
GROQ_CHAT_MODEL=optional-override
GROQ_WHISPER_MODEL=optional-override
```

5. Seed the demo users and four synthetic patients, then start the app:

```bash
npm run seed
npm run dev
```

Open http://localhost:3000 and sign in with a demo account:

| Role | Email | Password |
| --- | --- | --- |
| Doctor | doctor@demo.com | demo1234 |
| Nurse | nurse@demo.com | demo1234 |

The login page also has buttons that fill these in. For a faster production run, use `npm run build` and then `npm start`.

## Demo walkthrough

The demo patient is Meera Iyer (MRN-1001), who has type 2 diabetes, hypertension, declining kidney function and a penicillin allergy. Sample documents are in `sample-docs/`: a lab report and an outside prescription, each as a clean image and as a phone photo.

1. Sign in as the doctor and open Meera Iyer from the patient list.
2. Choose Upload report and upload `1_meera_lab_report_clean.png` (or the phone-photo version).
3. Review the extraction beside the source image, fix anything flagged, and approve. The labs appear in the timeline and trends.
4. Upload `3_meera_prescription_clean.png`. In the review screen the safety panel shows the alerts for the new medicines, such as the penicillin allergy conflict. Approve it after ticking the reviewed box.
5. Back on the patient page, check the safety alerts card and the creatinine and eGFR trends.
6. Choose New consultation, tick the consent box, and record, upload audio or paste a transcript.
7. Review the SOAP note. Click a source number to jump to the transcript line. Tick the suggested medication changes you accept and approve.
8. Open the Follow-up tasks card. Confirm or dismiss the drafted tasks and mark one done.
9. In Ask Medora, try "How has her kidney function changed?" and follow the source chips.
10. Click Pre-visit brief to see the one-page summary, then open Audit log in the top bar to see every action.

To see the nurse view, sign in as the nurse: approving, discarding and the audit log are not available.

## Roles and safety

<!-- permissions:start (generated by npm run permissions-table) -->
| Action | Doctor | Nurse |
| --- | --- | --- |
| View patients | yes | yes |
| Upload reports | yes | yes |
| Edit drafts | yes | yes |
| Approve documents and notes | yes | - |
| Discard drafts | yes | - |
| Record consultations | yes | yes |
| Ask Medora | yes | yes |
| View the audit log | yes | - |
| Confirm follow-up tasks | yes | - |
| Dismiss follow-up tasks | yes | - |
| Mark tasks done | yes | yes |
<!-- permissions:end -->

Disclaimer: Medora is decision support only. It is not a medical device, it has not been clinically validated, and it must not be used with real patients. The safety rules are a small curated demo set, not a complete or licensed drug database. Clinician judgement is always required.

## Limitations and roadmap

Limitations:

- Interaction and dosing rules are a demo subset of about 40 interactions plus a few renal and potassium rules.
- Any studies cited for the problem statement are from the United States.
- English only.
- Live captions during recording use the browser speech API; Chrome is recommended.
- Audio uploads are limited to 9 MB and recordings to 10 minutes.
- Free-tier AI rate limits apply. When Gemini is rate limited, the text steps fall back to Groq Llama; image extraction has no fallback.

Roadmap:

- Clinical validation with practising doctors.
- A licensed medication database in place of the demo rules.
- FHIR and ABDM/ABHA alignment.
- Hindi and Tamil support.
- Offline mode.
- A data-protection review before any real-world use.

## Credits

- Scribe flow and note structure ideas inspired by [OpenScribe](https://github.com/sammargolis/OpenScribe) (MIT).
- Product ideas inspired by [Phlox](https://github.com/bloodworks-io/phlox) (MIT).

Released under the MIT License (see `LICENSE`).
