import legacyGlossary from "./json/legacy/glossary.json" with { type: "json" };
import { GLOSSARY_TERMS } from "./glossary.js";

// The legacy import is a superseded copy of the main glossary. Any term the
// main glossary defines wins outright — the legacy file only contributes
// entries the current glossary does not carry, so an out-of-date definition
// (or a retired term) can never resurface beside the corrected one.
const currentTerms = new Set(
  GLOSSARY_TERMS.map((entry) => String(entry?.term || "").trim().toLowerCase()).filter(Boolean),
);

export const LEGACY_GLOSSARY_TERMS = (Array.isArray(legacyGlossary?.terms) ? legacyGlossary.terms : [])
  .filter((entry) => entry && typeof entry.term === "string" && typeof entry.description === "string")
  .filter((entry) => !currentTerms.has(entry.term.trim().toLowerCase()));
