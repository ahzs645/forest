export type NoticeData = {
  heading: string;
  body?: string;
  tone?: "info" | "positive" | "warning" | "danger";
};

/** A shortcut offer's terms, built by the controller (buildShortcutBrief). */
export type ShortcutBrief = {
  banner: string;
  odds: { clean: number; noticed: number; caught: number } | null;
  oddsText: string;
  oddsLine?: string;
  oddsReason?: string;
  catcher: string | null;
  offerText: string;
  declineText: string;
  bands: { tone: "positive" | "warning" | "danger"; text: string }[];
};

/** Structured content for the Field Radio display. */
type BaseContent = {
  notice?: NoticeData;
};

export type ContentData =
  | (BaseContent & { type: "message"; heading?: string; body: string })
  | {
      type: "assignment" | "task" | "issue" | "event" | "temptation" | "scenario";
      title: string;
      description: string;
      cardLabel?: string;
      context?: {
        operation?: string;
        objective?: string;
        stakes?: string;
      };
      decisionPrompt?: string;
      flavor?: string;
      sourceLabel?: string;
      whyNow?: string;
      surfaceReason?: string;
      surfaceSeverity?: "info" | "warning" | "danger";
      phaseLabel?: string;
      weather?: string;
      deadline?: string;
      map?: string;
      status?: Record<string, string>;
      intelLines?: string[];
      optionHeading?: string;
      optionTone?: "info" | "warning" | "danger";
      headline?: string;
      /** "Because you took: …" on a card an earlier choice scheduled. */
      provenance?: string;
      /** Present on a shortcut offer: its banner, odds and terms. */
      shortcut?: ShortcutBrief;
      optionDetails: {
        label: string;
        preview?: string;
        outcome?: string;
        riskLevel?: "low" | "medium" | "high";
        bands?: { tone: "positive" | "warning" | "danger"; text: string }[];
      }[];
      notice?: NoticeData;
    }
  | (BaseContent & { type: "outcome"; label: string; outcome?: string })
  | {
      type: "summary";
      heading: string;
      body: string;
      bullets: string[];
      highlights?: string[];
      seasonSummaries?: string[];
      trendLines?: string[];
      projection?: string[];
      achievements?: string[];
      notice?: NoticeData;
    }
  | (BaseContent & { type: "setup"; heading: string; subtitle?: string });
