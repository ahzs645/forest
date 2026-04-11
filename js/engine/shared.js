import {
  ISSUE_PREVIEW_SEVERITY,
  PENDING_PRESSURE_PRIORITY,
} from "./constants.js";

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function formatMetricName(key) {
  switch (key) {
    case "progress":
      return "Progress";
    case "forestHealth":
      return "Forest Health";
    case "relationships":
      return "Relationships";
    case "compliance":
      return "Compliance";
    case "budget":
      return "Budget";
    default:
      return key;
  }
}

export function applyDiminishingReturns(currentMetric, delta) {
  if (delta <= 0) {
    return delta;
  }

  if (currentMetric >= 90) {
    return Math.max(1, Math.floor(delta * 0.35));
  }
  if (currentMetric >= 75) {
    return Math.max(1, Math.floor(delta * 0.6));
  }
  return delta;
}

export function eventTouchesMetric(event, metric) {
  return Array.isArray(event?.options)
    && event.options.some((option) => {
      const effects = option?.effects || {};
      if (effects[metric] !== undefined) {
        return true;
      }
      if ((metric === "relationships" || metric === "compliance") && typeof effects.politicalCapital === "number") {
        return true;
      }
      if (metric === "progress" && typeof option?.timeUsed === "number") {
        return true;
      }
      return false;
    });
}

export function pickWeightedEntry(weightedPool, rng) {
  const totalWeight = weightedPool.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return weightedPool.length ? weightedPool[0].event : null;
  }

  let roll = rng() * totalWeight;
  for (const entry of weightedPool) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.event;
    }
  }

  return weightedPool[weightedPool.length - 1]?.event ?? null;
}

export function pickWeightedItem(weightedPool, rng, valueKey) {
  const totalWeight = weightedPool.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return weightedPool.length ? weightedPool[0]?.[valueKey] ?? null : null;
  }

  let roll = rng() * totalWeight;
  for (const entry of weightedPool) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry[valueKey] ?? null;
    }
  }

  return weightedPool[weightedPool.length - 1]?.[valueKey] ?? null;
}

export function humanizeLabel(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normaliseScheduledEventDelay(delay) {
  const numeric = Number(delay);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 1;
  }
  return Math.max(1, Math.min(2, Math.ceil(numeric / 4)));
}

export function normalizeBudgetDelta(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) {
    return 0;
  }
  if (Math.abs(numeric) <= 20) {
    return numeric;
  }
  return clamp(Math.round(numeric / 600), -12, 12);
}

export function scaleDerivedEffect(value, multiplier) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 0) {
    return 0;
  }

  const scaled = Math.round(numeric * multiplier);
  if (scaled !== 0) {
    return scaled;
  }
  return numeric > 0 ? 1 : -1;
}

export function hasMatchingTag(tags, tagSet) {
  if (!Array.isArray(tags) || !tags.length) {
    return false;
  }
  return tags.some((tag) => tagSet.has(tag));
}

export function hasAnyTag(tagSet, candidates) {
  for (const candidate of candidates) {
    if (tagSet.has(candidate)) {
      return true;
    }
  }
  return false;
}

export function rollRange(min, max, rng) {
  return Math.round(min + (max - min) * rng());
}

export function pressurePriority(metric) {
  const index = PENDING_PRESSURE_PRIORITY.indexOf(metric);
  return index === -1 ? PENDING_PRESSURE_PRIORITY.length : index;
}

export function isValidScheduleEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return false;
  }
  if (typeof entry.id === "string") {
    return true;
  }
  return Array.isArray(entry.candidates) && entry.candidates.some((candidate) => typeof candidate?.id === "string");
}

export function normalizeScheduleEntry(entry) {
  return {
    ...(typeof entry.id === "string" ? { id: entry.id } : {}),
    ...(Array.isArray(entry.candidates)
      ? {
          candidates: entry.candidates
            .filter((candidate) => typeof candidate?.id === "string")
            .map((candidate) => ({
              id: candidate.id,
              weight: candidate.weight,
              ...(candidate.metricBoosts && typeof candidate.metricBoosts === "object"
                ? { metricBoosts: { ...candidate.metricBoosts } }
                : {}),
              ...(candidate.force ? { force: true } : {}),
            })),
        }
      : {}),
    ...(entry.force ? { force: true } : {}),
    delay: entry.delay,
  };
}

export function normalizeScheduleEntries(scheduleSpec) {
  if (Array.isArray(scheduleSpec)) {
    return scheduleSpec
      .filter((entry) => isValidScheduleEntry(entry))
      .map((entry) => normalizeScheduleEntry(entry));
  }
  if (isValidScheduleEntry(scheduleSpec)) {
    return [normalizeScheduleEntry(scheduleSpec)];
  }
  return [];
}

export function pendingIssueKey(entry) {
  if (typeof entry?.id === "string") {
    return `id:${entry.id}`;
  }
  if (Array.isArray(entry?.candidates)) {
    const ids = entry.candidates
      .map((candidate) => candidate?.id)
      .filter(Boolean)
      .sort()
      .join("|");
    return `candidates:${ids}`;
  }
  return null;
}

export function issuePreviewSeverity(issue) {
  return ISSUE_PREVIEW_SEVERITY[issue?.id] || "info";
}

export function previewSeverityRank(severity) {
  switch (severity) {
    case "danger":
      return 2;
    case "warning":
      return 1;
    default:
      return 0;
  }
}
