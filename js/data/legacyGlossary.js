import legacyGlossary from "./json/legacy/glossary.json" with { type: "json" };

export const LEGACY_GLOSSARY_TERMS = Array.isArray(legacyGlossary?.terms) ? legacyGlossary.terms : [];
