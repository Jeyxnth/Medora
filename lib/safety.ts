// Medication safety helpers. Pure functions, no AI, no network.
import { canonicalName } from "./validate";

// Common Indian brand names -> generic. A small demo subset, not exhaustive.
const BRANDS: Record<string, string> = {
  voveran: "diclofenac", augmentin: "amoxicillin+clavulanate", clavam: "amoxicillin+clavulanate",
  "co amoxiclav": "amoxicillin+clavulanate", pan: "pantoprazole", pantop: "pantoprazole",
  omez: "omeprazole", nexpro: "esomeprazole", glycomet: "metformin", dolo: "paracetamol",
  crocin: "paracetamol", calpol: "paracetamol", amlong: "amlodipine", norvasc: "amlodipine",
  brufen: "ibuprofen", combiflam: "ibuprofen+paracetamol", ecosprin: "aspirin", disprin: "aspirin",
  storvas: "atorvastatin", atorva: "atorvastatin", lipitor: "atorvastatin", rosuvas: "rosuvastatin",
  telma: "telmisartan", losar: "losartan", cozaar: "losartan", lasix: "furosemide",
  aldactone: "spironolactone", coumadin: "warfarin", warf: "warfarin", plavix: "clopidogrel",
  deplatt: "clopidogrel", thyronorm: "levothyroxine", eltroxin: "levothyroxine",
  azithral: "azithromycin", mox: "amoxicillin", novamox: "amoxicillin", ciplox: "ciprofloxacin",
  septran: "cotrimoxazole", bactrim: "cotrimoxazole", "co trimoxazole": "cotrimoxazole",
  "trimethoprim+sulfamethoxazole": "cotrimoxazole", sulfamethoxazole: "cotrimoxazole",
  taxim: "cefotaxime", monocef: "ceftriaxone", zocef: "cefuroxime", ativan: "lorazepam",
  restyl: "alprazolam", valium: "diazepam", ultracet: "tramadol+paracetamol",
};

const PREFIX = /^(tab|tablet|tablets|cap|capsule|capsules|inj|injection|syp|syrup|oint|ointment|drops)\.?\s+/;
const DOSE = /\d+(\.\d+)?\s*(mg|mcg|ug|g|ml|iu|units?|%)(\/\d+(\.\d+)?\s*(mg|ml|g))?/g;
const SUFFIX = /\b(sr|xr|er|cr|mr|od|hcl|hydrochloride|sodium|calcium|besylate|maleate|tartrate|succinate|mesylate|hydrobromide)\b/g;

// "Tab. Voveran SR 100mg" -> "diclofenac"; "Amoxicillin + Clavulanic acid" -> "amoxicillin+clavulanate"
export function normalizeDrug(name: string | null | undefined): string {
  let s = (name ?? "").toLowerCase().replace(/\([^)]*\)/g, " ");
  s = s.replace(DOSE, " ").replace(/[^a-z0-9+\s.]/g, " ").replace(/\./g, " ").replace(/\s+/g, " ").trim();
  for (let prev = ""; prev !== s; ) {
    prev = s;
    s = s.replace(PREFIX, "");
  }
  s = s.replace(SUFFIX, " ").replace(/clavulanic acid/g, "clavulanate").replace(/\s*\+\s*/g, "+").replace(/\s+/g, " ").trim();
  if (BRANDS[s]) return BRANDS[s];
  const first = s.split(" ")[0];
  if (BRANDS[first]) return BRANDS[first];
  if (s.startsWith("amoxicillin") && s.includes("clavulan")) return "amoxicillin+clavulanate";
  return s;
}

// Total mg per day from free-text dose + frequency, or null when it cannot be determined.
export function parseDailyDoseMg(dose: string | null | undefined, frequency: string | null | undefined): number | null {
  const d = /(\d+(?:\.\d+)?)\s*(mg|mcg|ug|g)\b/i.exec(dose ?? "");
  if (!d) return null;
  const unit = d[2].toLowerCase();
  const mg = Number(d[1]) * (unit === "g" ? 1000 : unit === "mg" ? 1 : 0.001);

  const f = (frequency ?? "").toLowerCase();
  if (/week|alternate|sos|prn|as needed|stat/.test(f)) return null;
  const pattern = /\b(\d)\s*-\s*(\d)\s*-\s*(\d)(?:\s*-\s*(\d))?\b/.exec(f); // "1-0-1" style
  const every = /(?:every|q)\s*(\d+)\s*(?:h|hr|hrs|hours?)/.exec(f);
  const times =
    pattern ? pattern.slice(1).filter(Boolean).reduce((a, n) => a + Number(n), 0)
    : every ? 24 / Number(every[1])
    : /four times|qid|qds|\b4\s*times/.test(f) ? 4
    : /three times|\btds\b|\btid\b|thrice|\b3\s*times/.test(f) ? 3
    : /twice|\bbd\b|\bbid\b|\b2\s*times/.test(f) ? 2
    : /once|\bod\b|\bqd\b|daily|at night|\bhs\b|morning|\b1\s*time/.test(f) ? 1
    : null;
  return times ? mg * times : null;
}

// ---------------------------------------------------------------------------
// Drug classes (generic names after normalizeDrug). Small demo subset.
const CLASSES: Record<string, { label: string; members: string[]; aliases?: string[] }> = {
  penicillin: { label: "penicillins", aliases: ["penicillin", "penicillins", "pencillin"],
    members: ["amoxicillin", "ampicillin", "penicillin", "penicillin v", "piperacillin", "cloxacillin", "flucloxacillin", "amoxicillin+clavulanate"] },
  sulfonamide: { label: "sulfonamides", aliases: ["sulfa", "sulpha", "sulfonamide", "sulfonamides"],
    members: ["cotrimoxazole", "sulfamethoxazole", "sulfasalazine"] },
  nsaid: { label: "NSAIDs", aliases: ["nsaid", "nsaids", "anti inflammatory", "anti-inflammatory"],
    members: ["ibuprofen", "diclofenac", "naproxen", "aspirin", "ketorolac", "etoricoxib", "celecoxib", "indomethacin", "mefenamic acid", "piroxicam", "aceclofenac", "nimesulide", "ibuprofen+paracetamol"] },
  cephalosporin: { label: "cephalosporins", aliases: ["cephalosporin", "cephalosporins"],
    members: ["cefixime", "cefotaxime", "ceftriaxone", "cefuroxime", "cefpodoxime", "cefdinir", "cefazolin", "cephalexin", "cefadroxil"] },
  statin: { label: "statins", members: ["atorvastatin", "rosuvastatin", "simvastatin", "pravastatin", "lovastatin", "pitavastatin"] },
  ace_inhibitor: { label: "ACE inhibitors", members: ["ramipril", "enalapril", "lisinopril", "perindopril", "captopril", "benazepril"] },
  arb: { label: "ARBs", members: ["losartan", "telmisartan", "valsartan", "olmesartan", "candesartan", "irbesartan"] },
  ppi: { label: "PPIs", members: ["omeprazole", "pantoprazole", "esomeprazole", "rabeprazole", "lansoprazole"] },
  benzodiazepine: { label: "benzodiazepines", members: ["alprazolam", "lorazepam", "diazepam", "clonazepam", "midazolam"] },
  ssri: { label: "SSRIs", members: ["fluoxetine", "sertraline", "escitalopram", "citalopram", "paroxetine"] },
  nitrate: { label: "nitrates", members: ["isosorbide mononitrate", "isosorbide dinitrate", "nitroglycerin", "glyceryl trinitrate"] },
  beta_blocker: { label: "beta blockers", members: ["atenolol", "metoprolol", "propranolol", "bisoprolol", "carvedilol"] },
  opioid: { label: "opioids", members: ["morphine", "codeine", "tramadol", "tramadol+paracetamol", "fentanyl"] },
};
const DUP_CLASSES = ["nsaid", "statin", "ace_inhibitor", "arb", "ppi", "benzodiazepine"];
const LOW_DOSE_OK = new Set(["aspirin"]); // usually antiplatelet-dose: not treated as a duplicate NSAID or a renal NSAID

const components = (n: string) => n.split("+").filter(Boolean);
function classesOf(n: string): Set<string> {
  const out = new Set<string>();
  for (const [k, c] of Object.entries(CLASSES)) {
    if (c.members.includes(n) || components(n).some((x) => c.members.includes(x))) out.add(k);
  }
  return out;
}
// Class keys (e.g. "nsaid", "ace_inhibitor") a drug name belongs to.
export const drugClasses = (name: string): Set<string> => classesOf(normalizeDrug(name));

// A token is a generic name or a class key.
const hasToken = (n: string, token: string) => components(n).includes(token) || n === token || classesOf(n).has(token);

// ---------------------------------------------------------------------------
// Hand-curated interactions. This is a DEMO SUBSET of well-known pairs, NOT an exhaustive database.
// Order matters: the first matching rule for a pair of medicines wins, so specific rules go first.
type Sev = "critical" | "warning";
const INTERACTIONS: [string, string, Sev, string][] = [
  ["warfarin", "aspirin", "critical", "may increase bleeding risk"],
  ["warfarin", "nsaid", "critical", "may increase bleeding risk (NSAIDs also affect platelets and the stomach lining)"],
  ["warfarin", "clopidogrel", "warning", "may add to bleeding risk"],
  ["warfarin", "cotrimoxazole", "critical", "may markedly raise INR and bleeding risk"],
  ["warfarin", "ciprofloxacin", "warning", "may raise INR"],
  ["warfarin", "metronidazole", "warning", "may raise INR"],
  ["warfarin", "fluconazole", "warning", "may raise INR"],
  ["warfarin", "amiodarone", "warning", "may raise INR"],
  ["clopidogrel", "omeprazole", "warning", "omeprazole may reduce the antiplatelet effect of clopidogrel"],
  ["clopidogrel", "esomeprazole", "warning", "esomeprazole may reduce the antiplatelet effect of clopidogrel"],
  ["aspirin", "clopidogrel", "warning", "dual antiplatelet therapy may increase bleeding risk; confirm it is intended"],
  ["aspirin", "ibuprofen", "warning", "ibuprofen may interfere with the antiplatelet effect of aspirin"],
  ["simvastatin", "amlodipine", "warning", "may raise simvastatin levels and myopathy risk"],
  ["simvastatin", "clarithromycin", "critical", "may markedly raise simvastatin levels (myopathy, rhabdomyolysis)"],
  ["atorvastatin", "clarithromycin", "warning", "may raise atorvastatin levels and myopathy risk"],
  ["simvastatin", "amiodarone", "warning", "may raise simvastatin levels and myopathy risk"],
  ["ace_inhibitor", "arb", "warning", "dual renin-angiotensin blockade may increase hyperkalaemia and kidney injury risk"],
  ["ace_inhibitor", "spironolactone", "warning", "may cause hyperkalaemia"],
  ["arb", "spironolactone", "warning", "may cause hyperkalaemia"],
  ["ace_inhibitor", "nsaid", "warning", "NSAIDs may reduce the blood pressure effect and increase kidney injury risk"],
  ["arb", "nsaid", "warning", "NSAIDs may reduce the blood pressure effect and increase kidney injury risk"],
  ["potassium chloride", "ace_inhibitor", "warning", "may cause hyperkalaemia"],
  ["potassium chloride", "arb", "warning", "may cause hyperkalaemia"],
  ["potassium chloride", "spironolactone", "warning", "may cause hyperkalaemia"],
  ["lithium", "nsaid", "critical", "NSAIDs may raise lithium levels"],
  ["lithium", "ace_inhibitor", "warning", "may raise lithium levels"],
  ["methotrexate", "nsaid", "critical", "NSAIDs may raise methotrexate levels and toxicity"],
  ["methotrexate", "cotrimoxazole", "critical", "may increase methotrexate toxicity (bone marrow suppression)"],
  ["ssri", "nsaid", "warning", "may increase bleeding risk, especially gastrointestinal"],
  ["ssri", "tramadol", "warning", "may increase the risk of serotonin syndrome and seizures"],
  ["linezolid", "ssri", "critical", "may cause serotonin syndrome"],
  ["sildenafil", "nitrate", "critical", "may cause severe hypotension"],
  ["digoxin", "amiodarone", "warning", "may raise digoxin levels"],
  ["digoxin", "clarithromycin", "warning", "may raise digoxin levels"],
  ["digoxin", "verapamil", "warning", "may raise digoxin levels and slow heart rate"],
  ["beta_blocker", "verapamil", "critical", "may cause severe bradycardia or heart block"],
  ["allopurinol", "azathioprine", "critical", "may increase azathioprine toxicity (bone marrow suppression)"],
  ["ciprofloxacin", "theophylline", "warning", "may raise theophylline levels"],
  ["benzodiazepine", "opioid", "warning", "may cause additive sedation and respiratory depression"],
  // Intentionally no metformin interaction rules: its safety checks are the renal rules below.
];

// ---------------------------------------------------------------------------
// Every drug name the app knows (brands, generics, class members), for "Did you mean" suggestions.
export function knownDrugNames(): string[] {
  const generics = Object.values(BRANDS).flatMap((v) => v.split("+"));
  return [...new Set([...Object.keys(BRANDS), ...generics, ...Object.values(CLASSES).flatMap((c) => c.members)])];
}

export type Allergy = { substance: string | null; reaction?: string | null };
export type Med = { drug_name: string; dose?: string | null; frequency?: string | null };
export type SafetyLab = { test_name: string; value: number; unit?: string | null; collected_date: string | null; document_id?: string | null };
export type Alert = {
  key: string;
  severity: Sev;
  title: string;
  detail: string;
  evidence: { label: string; href?: string }[];
  medIndexes: number[]; // indexes into the activeMeds passed to checkSafety
};

const medLabel = (m: Med) => [m.drug_name, m.dose, m.frequency].filter(Boolean).join(" ");
const pretty = (n: string) => n.replace(/_/g, " ").replace(/\+/g, " + ");

function latestLab(labs: SafetyLab[], name: string): SafetyLab | undefined {
  return labs
    .filter((l) => canonicalName(l.test_name) === name && typeof l.value === "number")
    .sort((a, b) => (b.collected_date ?? "").localeCompare(a.collected_date ?? ""))[0];
}

export function checkSafety(input: { patientId: string; allergies: Allergy[]; activeMeds: Med[]; labs: SafetyLab[] }): Alert[] {
  const { patientId, allergies, activeMeds, labs } = input;
  const alerts: Alert[] = [];
  const norm = activeMeds.map((m) => normalizeDrug(m.drug_name));
  const medEv = (i: number) => ({ label: `Medication: ${medLabel(activeMeds[i])}` });
  const labEv = (l: SafetyLab) => ({
    label: `${l.test_name} ${l.value}${l.unit ? ` ${l.unit}` : ""}${l.collected_date ? ` (${l.collected_date})` : ""}`,
    href: l.document_id ? `/patients/${patientId}/documents/${l.document_id}` : undefined,
  });

  // 1. Allergy conflicts
  for (const a of allergies) {
    const text = (a.substance ?? "").toLowerCase();
    if (!text.trim()) continue;
    const allergen = normalizeDrug(a.substance);
    const aClasses = new Set<string>(); // classes named outright, e.g. "Sulfa drugs"
    for (const [k, c] of Object.entries(CLASSES)) {
      if (c.aliases?.some((x) => new RegExp(`\\b${x}\\b`).test(text))) aClasses.add(k);
    }
    const memberClasses = classesOf(allergen); // classes the named drug belongs to
    const allergyEv = { label: `Allergy: ${a.substance}${a.reaction ? ` (${a.reaction})` : ""}` };

    norm.forEach((n, i) => {
      const direct = components(n).some((c) => components(allergen).includes(c));
      const viaClass = [...aClasses].find((k) => classesOf(n).has(k));
      const sibling = [...memberClasses].find((k) => classesOf(n).has(k));
      const penCross = [...aClasses, ...memberClasses].includes("penicillin") && classesOf(n).has("cephalosporin");
      if (direct || viaClass) {
        alerts.push({
          key: `allergy:${i}:${a.substance}`, severity: "critical",
          title: `Possible allergy conflict: ${activeMeds[i].drug_name}`,
          detail: `${activeMeds[i].drug_name} may conflict with the recorded allergy to ${a.substance}${viaClass ? ` (${CLASSES[viaClass].label})` : ""}. Review before continuing.`,
          evidence: [allergyEv, medEv(i)], medIndexes: [i],
        });
      } else if (penCross) {
        alerts.push({
          key: `allergy-cross:${i}:${a.substance}`, severity: "warning",
          title: `Possible cross-reactivity: ${activeMeds[i].drug_name}`,
          detail: `Cephalosporins may cross-react in patients with a penicillin allergy (${a.substance}). Review the history of the reaction.`,
          evidence: [allergyEv, medEv(i)], medIndexes: [i],
        });
      } else if (sibling) {
        alerts.push({
          key: `allergy-sibling:${i}:${a.substance}`, severity: "warning",
          title: `Possible cross-reactivity: ${activeMeds[i].drug_name}`,
          detail: `${activeMeds[i].drug_name} is in the same class (${CLASSES[sibling].label}) as ${a.substance}, which is a recorded allergy. It may cross-react; review.`,
          evidence: [allergyEv, medEv(i)], medIndexes: [i],
        });
      }
    });
  }

  // 2. Duplicate therapy
  for (let i = 0; i < norm.length; i++) {
    for (let j = i + 1; j < norm.length; j++) {
      if (!norm[i] || !norm[j]) continue;
      let why: string | null = null;
      if (norm[i] === norm[j]) why = `${pretty(norm[i])} is listed twice`;
      else {
        const shared = DUP_CLASSES.find((k) => classesOf(norm[i]).has(k) && classesOf(norm[j]).has(k) && !LOW_DOSE_OK.has(norm[i]) && !LOW_DOSE_OK.has(norm[j]));
        if (shared) why = `two ${CLASSES[shared].label} are listed (${pretty(norm[i])} and ${pretty(norm[j])})`;
      }
      if (why) {
        alerts.push({
          key: `dup:${i}:${j}`, severity: "warning", title: "Possible duplicate therapy",
          detail: `Active medications include a possible duplicate: ${why}. Review whether both are intended.`,
          evidence: [medEv(i), medEv(j)], medIndexes: [i, j],
        });
      }
    }
  }

  // 3. Renal checks, using the most recent eGFR (creatinine shown as supporting evidence)
  const egfr = latestLab(labs, "eGFR");
  const creat = latestLab(labs, "Creatinine");
  if (egfr) {
    const labEvidence = [labEv(egfr), ...(creat ? [labEv(creat)] : [])];
    norm.forEach((n, i) => {
      if (n === "metformin") {
        if (egfr.value < 30) {
          alerts.push({
            key: `renal-metformin:${i}`, severity: "critical", title: "Metformin with very low eGFR",
            detail: `Latest eGFR is ${egfr.value}; metformin is generally contraindicated below 30. Review.`,
            evidence: [...labEvidence, medEv(i)], medIndexes: [i],
          });
        } else if (egfr.value < 45) {
          const mg = parseDailyDoseMg(activeMeds[i].dose, activeMeds[i].frequency);
          if (mg == null) {
            alerts.push({
              key: `renal-metformin:${i}`, severity: "warning", title: "Metformin with reduced eGFR",
              detail: `Latest eGFR is ${egfr.value}. The daily dose could not be verified from "${medLabel(activeMeds[i])}"; the commonly recommended maximum at this eGFR is 1000 mg/day. Review the dose.`,
              evidence: [...labEvidence, medEv(i)], medIndexes: [i],
            });
          } else if (mg > 1000) {
            alerts.push({
              key: `renal-metformin:${i}`, severity: "warning", title: "Metformin dose may be high for eGFR",
              detail: `Daily dose of about ${mg} mg exceeds the commonly recommended maximum of 1000 mg/day at an eGFR of ${egfr.value}; reassess dose.`,
              evidence: [...labEvidence, medEv(i)], medIndexes: [i],
            });
          }
        }
      }
      if (classesOf(n).has("nsaid") && !LOW_DOSE_OK.has(n) && egfr.value < 60) {
        const critical = egfr.value < 30;
        alerts.push({
          key: `renal-nsaid:${i}`, severity: critical ? "critical" : "warning",
          title: `${activeMeds[i].drug_name} with ${critical ? "very low" : "reduced"} eGFR`,
          detail: `Latest eGFR is ${egfr.value}. NSAIDs may worsen kidney function${critical ? " and are generally avoided below 30" : ""}. Review.`,
          evidence: [...labEvidence, medEv(i)], medIndexes: [i],
        });
      }
    });
  }

  // 4. Potassium with agents that raise it
  const k = latestLab(labs, "Potassium");
  if (k && k.value > 5.0) {
    norm.forEach((n, i) => {
      if (hasToken(n, "ace_inhibitor") || hasToken(n, "arb") || n === "spironolactone") {
        alerts.push({
          key: `potassium:${i}`, severity: "warning", title: `High potassium with ${activeMeds[i].drug_name}`,
          detail: `Latest potassium is ${k.value}. ${activeMeds[i].drug_name} may raise potassium further. Review.`,
          evidence: [labEv(k), medEv(i)], medIndexes: [i],
        });
      }
    });
  }

  // 5. Interactions (first matching rule per pair of medicines)
  for (let i = 0; i < norm.length; i++) {
    for (let j = i + 1; j < norm.length; j++) {
      const rule = INTERACTIONS.find(([a, b]) => (hasToken(norm[i], a) && hasToken(norm[j], b)) || (hasToken(norm[j], a) && hasToken(norm[i], b)));
      if (rule) {
        alerts.push({
          key: `interaction:${i}:${j}`, severity: rule[2],
          title: `Possible interaction: ${activeMeds[i].drug_name} + ${activeMeds[j].drug_name}`,
          detail: `This combination ${rule[3]}. Review.`,
          evidence: [medEv(i), medEv(j)], medIndexes: [i, j],
        });
      }
    }
  }

  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}
