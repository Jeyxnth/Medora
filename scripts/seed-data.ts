// Synthetic demo patients. Shared by the seed script and the check scripts (no database needed to read it).
// lab helper: [test, value, unit, low, high, flag]
type Lab = [string, number, string, number | null, number | null, string];
const mkLabs = (date: string, labs: Lab[]) =>
  labs.map(([test_name, value, unit, ref_low, ref_high, flag]) => ({
    test_name, value, unit, ref_low, ref_high, flag, collected_date: date,
  }));

export const patients = [
  {
    p: { name: "Sasha Santosh", dob: "1967-03-14", sex: "F", mrn: "MRN-1001", phone: "+91 98400 11001" },
    allergies: [{ substance: "Penicillin", reaction: "Rash" }],
    encounters: [
      { encounter_date: "2025-04-10", type: "Follow-up", summary: "Type 2 diabetes and hypertension review. HbA1c 7.1%, BP 132/84. Continue metformin and amlodipine." },
      { encounter_date: "2025-10-15", type: "Follow-up", summary: "HbA1c rising to 7.9%. Creatinine up to 1.2. Counselled on diet; started atorvastatin." },
      { encounter_date: "2026-02-20", type: "Follow-up", summary: "Fatigue and mild ankle swelling. BP 144/90. Repeat labs ordered." },
      { encounter_date: "2026-09-18", type: "Follow-up", summary: "HbA1c 8.8%, creatinine 1.6, eGFR 41. Declining renal function; review metformin dose." },
    ],
    meds: [
      { drug_name: "Metformin", dose: "1000 mg", frequency: "Twice daily", start_date: "2019-06-01" },
      { drug_name: "Amlodipine", dose: "5 mg", frequency: "Once daily", start_date: "2020-01-15" },
      { drug_name: "Atorvastatin", dose: "20 mg", frequency: "Once daily at night", start_date: "2025-10-15" },
    ],
    labs: [
      ...mkLabs("2025-04-10", [
        ["HbA1c", 7.1, "%", 4, 5.6, "high"],
        ["Creatinine", 0.9, "mg/dL", 0.6, 1.1, "normal"],
        ["eGFR", 78, "mL/min/1.73m2", 90, null, "low"],
      ]),
      ...mkLabs("2025-12-05", [
        ["HbA1c", 7.9, "%", 4, 5.6, "high"],
        ["Creatinine", 1.2, "mg/dL", 0.6, 1.1, "high"],
        ["eGFR", 58, "mL/min/1.73m2", 90, null, "low"],
      ]),
      ...mkLabs("2026-09-18", [
        ["HbA1c", 8.8, "%", 4, 5.6, "high"],
        ["Creatinine", 1.6, "mg/dL", 0.6, 1.1, "high"],
        ["eGFR", 41, "mL/min/1.73m2", 90, null, "low"],
        ["Total Cholesterol", 224, "mg/dL", null, 200, "high"],
        ["LDL Cholesterol", 138, "mg/dL", null, 100, "high"],
        ["HDL Cholesterol", 42, "mg/dL", 50, null, "low"],
        ["Triglycerides", 190, "mg/dL", null, 150, "high"],
      ]),
    ],
  },
  {
    p: { name: "Arjun Nair", dob: "1981-08-02", sex: "M", mrn: "MRN-1002", phone: "+91 98400 11002" },
    allergies: [],
    encounters: [{ encounter_date: "2026-07-12", type: "Follow-up", summary: "Hypertension, BP 138/88. Continue telmisartan." }],
    meds: [{ drug_name: "Telmisartan", dose: "40 mg", frequency: "Once daily", start_date: "2024-03-01" }],
    labs: mkLabs("2026-07-12", [
      ["Creatinine", 0.95, "mg/dL", 0.7, 1.3, "normal"],
      ["Potassium", 4.3, "mmol/L", 3.5, 5.1, "normal"],
    ]),
  },
  {
    p: { name: "Lakshmi Venkatesh", dob: "1974-11-23", sex: "F", mrn: "MRN-1003", phone: "+91 98400 11003" },
    allergies: [{ substance: "Sulfa drugs", reaction: "Hives" }],
    encounters: [{ encounter_date: "2026-06-03", type: "Follow-up", summary: "Hypothyroidism, stable on levothyroxine." }],
    meds: [{ drug_name: "Levothyroxine", dose: "75 mcg", frequency: "Once daily, morning", start_date: "2021-09-10" }],
    labs: mkLabs("2026-06-03", [
      ["TSH", 3.8, "mIU/L", 0.4, 4.0, "normal"],
      ["Free T4", 1.1, "ng/dL", 0.8, 1.8, "normal"],
    ]),
  },
  {
    p: { name: "Rohan Deshmukh", dob: "1990-01-30", sex: "M", mrn: "MRN-1004", phone: "+91 98400 11004" },
    allergies: [],
    encounters: [{ encounter_date: "2026-08-21", type: "Visit", summary: "Mild persistent asthma and seasonal allergic rhinitis. Inhaler technique reviewed." }],
    meds: [
      { drug_name: "Budesonide inhaler", dose: "200 mcg", frequency: "Twice daily", start_date: "2025-05-01" },
      { drug_name: "Cetirizine", dose: "10 mg", frequency: "As needed", start_date: "2025-05-01" },
    ],
    labs: mkLabs("2026-08-21", [
      ["Hemoglobin", 14.8, "g/dL", 13.0, 17.0, "normal"],
      ["IgE", 240, "IU/mL", null, 100, "high"],
    ]),
  },
  {
    p: { name: "Fatima Sheikh", dob: "1955-05-09", sex: "F", mrn: "MRN-1005", phone: "+91 98400 11005" },
    allergies: [{ substance: "Aspirin", reaction: "Bronchospasm" }],
    encounters: [{ encounter_date: "2026-05-14", type: "Follow-up", summary: "Osteoarthritis of the knees and mild anemia. Iron supplementation started." }],
    meds: [
      { drug_name: "Paracetamol", dose: "500 mg", frequency: "Up to three times daily", start_date: "2023-02-01" },
      { drug_name: "Ferrous sulfate", dose: "200 mg", frequency: "Once daily", start_date: "2026-05-14" },
    ],
    labs: mkLabs("2026-05-14", [
      ["Hemoglobin", 10.4, "g/dL", 12.0, 15.5, "low"],
      ["Ferritin", 12, "ng/mL", 15, 150, "low"],
    ]),
  },
];
