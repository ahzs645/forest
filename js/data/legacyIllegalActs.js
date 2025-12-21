import legacyIllegalActs from './json/legacy/illegalActs.json';

export const LEGACY_ILLEGAL_ACTS = Array.isArray(legacyIllegalActs?.illegal_acts) ? legacyIllegalActs.illegal_acts : [];

