import type { Figure } from "./types";

const NUMBER = /\d+(?:\.\d+)?/g;

export function numbersIn(value: string): string[] {
  return value.match(NUMBER) ?? [];
}

export function formatNumber(value: number): string {
  const rounded = Math.round((value + Number.EPSILON) * 1000) / 1000;
  if (rounded === 0) return "0";
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

export function roundMeasure(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

/** Signed percent change, rounded to one decimal. Null when last month is 0. */
export function percentPoints(last: number, current: number): number | null {
  if (last === 0) return null;
  const raw = ((current - last) / Math.abs(last)) * 100;
  return Math.round(raw * 10) / 10;
}

export function percentLabel(points: number | null): string | null {
  if (points === null) return null;
  return Math.abs(points).toFixed(1);
}

export function allowedNumbers(figures: Figure[], extra: string): Set<string> {
  const allowed = new Set<string>(numbersIn(extra));
  for (const fig of figures) {
    for (const token of numbersIn(`${fig.channel} ${fig.metric}`)) allowed.add(token);
    addValue(allowed, fig.lastMonth);
    addValue(allowed, fig.thisMonth);
    addValue(allowed, fig.change);
    if (fig.change !== null) addValue(allowed, Math.abs(fig.change));
    if (fig.percentLabel) {
      for (const token of numbersIn(fig.percentLabel)) allowed.add(token);
    }
  }
  return allowed;
}

function addValue(allowed: Set<string>, value: number | null): void {
  if (value === null) return;
  for (const token of numbersIn(formatNumber(value))) allowed.add(token);
}

export function inventedNumbers(text: string, allowed: Set<string>): string[] {
  return numbersIn(text).filter((token) => !allowed.has(token));
}

export function visibleReportText(parts: {
  clientLine: string;
  periodLine: string;
  whatChanged: string;
  whyItMatters: string;
  nextActions: string;
  audit: string;
}): string {
  return [
    parts.clientLine,
    parts.periodLine,
    parts.whatChanged,
    parts.whyItMatters,
    parts.nextActions,
    parts.audit,
  ].join("\n");
}
