import legacyGlossary from './json/legacy/glossary.json';

export const LEGACY_GLOSSARY_TERMS = Array.isArray(legacyGlossary?.terms) ? legacyGlossary.terms : [];

