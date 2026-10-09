# Handwritten prescription test cases

Create these yourself on paper and photograph them. Use made-up names and drugs only, never a real person's prescription.
Upload each one on a patient page (Upload report). Sign in as a doctor, and also try once as a nurse.

Before you start: open the patient page and note their allergies and current medicines, so you know which drug should trigger a safety alert (for example, write a drug from the allergy list, or a drug that interacts with one they already take).

Needs `supabase/phase9.sql` run once for the audit entry to carry details (see check 5).

## Case 1: neat prescription
Clear block letters. 2 or 3 common drugs (for example Metformin 500 mg, 1-0-1, 30 days), a date (dd/mm/yyyy) and a doctor name.
- [ ] Extraction finishes with one upload (a single request in the Network tab).
- [ ] The image shows beside the fields. Most fields have no highlight.
- [ ] Any field the AI marked low confidence is amber and needs a tick or edit before Approve is enabled.
- [ ] Approve and save works. The medicines appear on the patient page.

## Case 2: messy prescription
Fast cursive. Scribble over one dose, and make the frequency unreadable. Leave the date half-written.
- [ ] The unreadable dose or frequency shows as "illegible" in a red field with the message "Type the correct value, or delete the row".
- [ ] Approve stays disabled while any field is illegible. The red field is still illegible after ticking other boxes.
- [ ] A low-confidence field (amber) has a checkbox "I checked ... against the image". Approve stays disabled until ticked or edited.
- [ ] An unreadable date comes back empty, with "Set the document date." showing.
- [ ] Nothing is saved yet: the patient page medicines and timeline are unchanged. Reload the review page; it is still a draft.
- [ ] Fix every flagged field and approve. The saved values are your corrected ones.

## Case 3: ambiguous drug name
Write a drug name with a sloppy spelling or letters that could be read two ways (for example "Metfomin" or "Amlodipin"), plus one drug the patient already takes.
- [ ] A "Did you mean ...?" chip appears under the drug name, offering the patient's own medicine first.
- [ ] Clicking the chip changes the name. Nothing changes if you do not click it (no auto-replace).
- [ ] The drug cell is flagged amber or red and needs an edit or tick.
- [ ] Add a conflicting drug (allergy, kidney or interaction) on the form: a safety alert appears in the "Safety check" section. A critical alert needs the "I have reviewed these alerts" tick.

## Checks for every case
1. **Illegible flagged:** red field, cannot approve.
2. **Suggestion appears:** case 3.
3. **Nothing saves before confirmation:** after upload, the patient page shows no new medicines and the document is a "Draft - needs review".
4. **Nurse cannot confirm:** signed in as a nurse, the review shows "Only a doctor can approve".
5. **Audit entry:** as a doctor, open Audit log, find the `approve` row for the document, and open "Review details". It shows who confirmed, each edit as `"before" → "after"`, fields confirmed as read, added/removed rows and any safety alerts. Without phase9.sql the `approve` row exists but has no details.
6. **Safety alert on a conflicting drug:** case 3, as above. The alert titles are also in the audit details.
