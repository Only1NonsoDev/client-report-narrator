export type Direction = "up" | "down" | "flat" | "missing";

export type Figure = {
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

export type ReportBody = {
  clientLine: string;
  periodLine: string;
  whatChanged: string;
  whyItMatters: string;
  nextActions: string;
  audit: string;
};

export type ReportResponse = ReportBody & {
  mode: "demo" | "model";
  model: string | null;
  notice: string | null;
  sourceCsv: string;
  client: string;
  period: string;
};
