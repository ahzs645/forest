export type NoticeData = {
  heading: string;
  body?: string;
  tone?: "info" | "positive" | "warning" | "danger";
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
      optionDetails: { label: string; outcome?: string }[];
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
