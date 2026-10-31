export type Direction = "up" | "down" | "flat" | "missing";

export type Figure = {
  id: string;
  channel: string;
  metric: string;
  lastMonth: number | null;
  thisMonth: number | null;
  change: number | null;
  percentPoints: number | null;
  percentLabel: string | null;
  direction: Direction;
  order: number;
};

export type DriverTag = "campaign" | "seasonality" | "site" | "client note" | "unknown";

export type SectionKey = "campaign" | "seasonality" | "site" | "goals";

export type ContextInput = Record<SectionKey, string>;

export type Note = {
  id: string;
  section: SectionKey;
  tag: Exclude<DriverTag, "unknown">;
  /** Text before the first colon when it names a channel on the sheet. Null means the whole account. */
  scope: string | null;
  /** False when the line named a scope that matches no row, so it is not tied to any move. */
  linked: boolean;
  text: string;
};

export type Evidence = { kind: "row"; id: string } | { kind: "note"; id: string };

export type Sentence = {
  id: string;
  text: string;
  tag: DriverTag | null;
  evidence: Evidence[];
};

export type Prompt = { section: SectionKey; text: string };

export type Review = {
  clientLine: string;
  periodLine: string;
  figures: Figure[];
  notes: Note[];
  moved: Sentence[];
  why: Sentence[];
  next: Sentence[];
  /** One prompt per empty context section. */
  prompts: Prompt[];
  /** Lines in the context pack that could not be tied to a row. */
  warnings: string[];
  /** Every number token a sentence may contain outside a quoted note. */
  allowed: string[];
  /** All note text, joined, so a quote in an edited sentence can be checked. */
  quoteSource: string;
};

export type ReviewResponse = Review & {
  sourceCsv: string;
  sourceContext: ContextInput;
  client: string;
  period: string;
};
