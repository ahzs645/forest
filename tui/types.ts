/** Structured content for the Field Radio display. */
export type ContentData =
  | { type: "message"; heading?: string; body: string }
  | {
      type: "task" | "issue";
      title: string;
      description: string;
      flavor?: string;
      optionDetails: { label: string; outcome?: string }[];
    }
  | { type: "outcome"; label: string; outcome?: string }
  | {
      type: "summary";
      heading: string;
      body: string;
      bullets: string[];
      achievements?: string[];
    }
  | { type: "setup"; heading: string; subtitle?: string };
