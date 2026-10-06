// Medication safety helpers. Pure functions, no AI, no network.

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
