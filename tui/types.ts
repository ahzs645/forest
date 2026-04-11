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
      type: "assignment" | "task" | "issue" | "event" | "temptation";
      title: string;
      description: string;
      flavor?: string;
      sourceLabel?: string;
      whyNow?: string;
      surfaceReason?: string;
      surfaceSeverity?: "info" | "warning" | "danger";
      phaseLabel?: string;
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
