import { parseSheet, SheetError, type Row } from "./csv";
import {
  allowedNumbers,
  formatNumber,
  percentLabel,
  percentPoints,
  roundMeasure,
  visibleReportText,
} from "./ground";
import type { Direction, Figure, ReportBody } from "./types";

export { SheetError };

export type LocalReport = ReportBody & {
  figures: Figure[];
  allowed: Set<string>;
  text: string;
};

export function narrateLocal(csv: string, client: string, period: string): LocalReport {
  const name = client.trim();
  const label = period.trim();
  if (name.length > 80) throw new SheetError("Keep the client name under 80 characters.");
  if (label.length > 80) throw new SheetError("Keep the period label under 80 characters.");

  const figures = parseSheet(csv).map((row, order) => toFigure(row, order));
  const clientLine = name ? name : "Client name is missing.";
  const periodLine = label ? label : "Period label is missing.";
  const body: ReportBody = {
    clientLine,
    periodLine,
    whatChanged: buildWhatChanged(figures),
    whyItMatters: buildWhy(figures),
    nextActions: buildActions(figures),
    audit: figures.map(auditLine).join("\n"),
  };
  const allowed = allowedNumbers(figures, `${name}\n${label}`);
  return {
    ...body,
    figures,
    allowed,
    text: visibleReportText(body),
  };
}

function toFigure(row: Row, order: number): Figure {
  const comparable = row.lastMonth !== null && row.thisMonth !== null;
  const change = comparable ? roundMeasure(row.thisMonth! - row.lastMonth!) : null;
  const points = comparable ? percentPoints(row.lastMonth!, row.thisMonth!) : null;
  return {
    channel: row.channel,
    metric: row.metric,
    lastMonth: row.lastMonth,
    thisMonth: row.thisMonth,
    change,
    percentPoints: points,
    percentLabel: percentLabel(points),
    direction: directionFor(change),
    order,
  };
}

function directionFor(change: number | null): Direction {
  if (change === null) return "missing";
  if (change === 0) return "flat";
  return change > 0 ? "up" : "down";
}

function fullName(fig: Figure): string {
  return `${fig.channel} ${fig.metric.toLowerCase()}`;
}

function changeSentence(fig: Figure): string {
  const metric = fig.metric.toLowerCase();
  if (fig.lastMonth === null && fig.thisMonth === null) {
    return `${metric}: this month is missing and last month is missing, so the change is missing.`;
  }
  if (fig.lastMonth === null) {
    return `${metric} this month is ${formatNumber(fig.thisMonth!)}. Last month is missing, so the change is missing.`;
  }
  if (fig.thisMonth === null) {
    return `${metric} last month was ${formatNumber(fig.lastMonth)}. This month is missing, so the change is missing.`;
  }

  const last = formatNumber(fig.lastMonth);
  const current = formatNumber(fig.thisMonth);
  if (fig.direction === "flat") {
    if (!fig.percentLabel) {
      return `${metric} stayed at ${current}. The change is 0. The percent change is missing because last month is 0.`;
    }
    return `${metric} stayed at ${current}. The change is 0 (${fig.percentLabel}%).`;
  }

  const amount = formatNumber(Math.abs(fig.change!));
  const word = fig.direction === "up" ? "up" : "down";
  if (!fig.percentLabel) {
    return `${metric} moved from ${last} last month to ${current} this month, ${word} ${amount}. The percent change is missing because last month is 0.`;
  }
  return `${metric} moved from ${last} last month to ${current} this month, ${word} ${amount}, which is ${fig.percentLabel}%.`;
}

function buildWhatChanged(figures: Figure[]): string {
  const groups: { channel: string; lines: string[] }[] = [];
  for (const fig of figures) {
    const found = groups.find((group) => group.channel === fig.channel);
    if (found) found.lines.push(changeSentence(fig));
    else groups.push({ channel: fig.channel, lines: [changeSentence(fig)] });
  }
  return groups.map((group) => `${group.channel}\n${group.lines.join("\n")}`).join("\n\n");
}

function pickExtreme(figures: Figure[], kind: "up" | "down"): Figure | null {
  const pool = figures.filter((fig) => fig.direction === kind && fig.percentPoints !== null);
  if (!pool.length) return null;
  return pool.reduce((best, fig) => {
    const better =
      kind === "up" ? fig.percentPoints! > best.percentPoints! : fig.percentPoints! < best.percentPoints!;
    if (better) return fig;
    if (fig.percentPoints === best.percentPoints && fig.order < best.order) return fig;
    return best;
  });
}

function buildWhy(figures: Figure[]): string {
  const parts: string[] = [];
  const both = figures.some((fig) => fig.lastMonth !== null && fig.thisMonth !== null);

  if (!both) {
    parts.push("No row has both months filled in, so this report cannot say what rose or fell.");
  } else {
    const rise = pickExtreme(figures, "up");
    const drop = pickExtreme(figures, "down");
    const ups = figures.some((fig) => fig.direction === "up");
    const downs = figures.some((fig) => fig.direction === "down");
    if (rise) {
      parts.push(
        `${fullName(rise)} rose the most on this sheet, from ${formatNumber(rise.lastMonth!)} to ${formatNumber(rise.thisMonth!)} (${rise.percentLabel}%).`,
      );
    } else if (ups) {
      parts.push("A metric rose, and the percent change is missing because last month is 0.");
    } else {
      parts.push("No metric on this sheet rose.");
    }
    if (drop) {
      parts.push(
        `${fullName(drop)} fell the most on this sheet, from ${formatNumber(drop.lastMonth!)} to ${formatNumber(drop.thisMonth!)} (${drop.percentLabel}%).`,
      );
    } else if (downs) {
      parts.push("A metric fell, and the percent change is missing because last month is 0.");
    } else {
      parts.push("No metric on this sheet fell.");
    }
  }

  for (const fig of figures) {
    if (fig.lastMonth === null && fig.thisMonth === null) {
      parts.push(`${fullName(fig)} is missing for both months, so the change is missing.`);
    } else if (fig.lastMonth === null) {
      parts.push(
        `${fullName(fig)} cannot be compared. Last month is missing. This month is ${formatNumber(fig.thisMonth!)}.`,
      );
    } else if (fig.thisMonth === null) {
      parts.push(
        `${fullName(fig)} cannot be compared. This month is missing. Last month was ${formatNumber(fig.lastMonth)}.`,
      );
    } else if (fig.percentLabel === null) {
      parts.push(
        `${fullName(fig)} moved from ${formatNumber(fig.lastMonth)} to ${formatNumber(fig.thisMonth)}. The percent change is missing because last month is 0.`,
      );
    }
  }

  parts.push(...spendLeadNotes(figures));
  return parts.join("\n\n");
}

function spendLeadNotes(figures: Figure[]): string[] {
  const notes: string[] = [];
  const channels: string[] = [];
  for (const fig of figures) {
    if (!channels.includes(fig.channel)) channels.push(fig.channel);
  }
  for (const channel of channels) {
    const rows = figures.filter((fig) => fig.channel === channel);
    const spend = rows.find((row) => /spend|cost|budget/i.test(row.metric) && row.direction !== "missing");
    const leads = rows.find((row) => /lead|conversion|sale/i.test(row.metric) && row.direction !== "missing");
    if (!spend || !leads) continue;
    const opposite =
      (spend.direction === "up" && leads.direction === "down") ||
      (spend.direction === "down" && leads.direction === "up");
    if (!opposite) continue;
    const spendWord = spend.direction === "up" ? "up" : "down";
    const leadWord = leads.direction === "up" ? "up" : "down";
    notes.push(
      `${channel} ${spend.metric.toLowerCase()} went ${spendWord} and ${channel} ${leads.metric.toLowerCase()} went ${leadWord}. Cost per lead is missing from the sheet.`,
    );
  }
  return notes;
}

function buildActions(figures: Figure[]): string {
  const lines: string[] = [];
  const rise = pickExtreme(figures, "up");
  const drop = pickExtreme(figures, "down");
  if (rise) {
    lines.push(
      `Tell the client about ${fullName(rise)}: ${formatNumber(rise.lastMonth!)} last month and ${formatNumber(rise.thisMonth!)} this month.`,
    );
  }
  if (drop) {
    lines.push(
      `Review ${fullName(drop)} before the next plan: ${formatNumber(drop.lastMonth!)} last month and ${formatNumber(drop.thisMonth!)} this month.`,
    );
  }
  for (const fig of figures) {
    if (fig.lastMonth === null && fig.thisMonth === null) {
      lines.push(`Ask the client for ${fullName(fig)} for this month and last month. Those figures are missing.`);
    } else if (fig.lastMonth === null) {
      lines.push(`Ask the client for ${fullName(fig)} for last month. That figure is missing.`);
    } else if (fig.thisMonth === null) {
      lines.push(`Ask the client for ${fullName(fig)} for this month. That figure is missing.`);
    }
  }
  if (!lines.length) {
    lines.push("Nothing on this sheet rose, fell, or is missing. You can send it as a steady month.");
  }
  return lines.join("\n\n");
}

function auditLine(fig: Figure): string {
  const name = `${fig.channel} · ${fig.metric}`;
  const last = fig.lastMonth === null ? "missing" : formatNumber(fig.lastMonth);
  const current = fig.thisMonth === null ? "missing" : formatNumber(fig.thisMonth);
  if (fig.change === null) {
    return `${name} — last month ${last}, this month ${current}, change missing`;
  }
  if (fig.percentLabel === null) {
    const amount = formatNumber(Math.abs(fig.change));
    const word = fig.direction === "down" ? "down" : "up";
    const changeBit = fig.direction === "flat" ? "change 0" : `change ${word} ${amount}`;
    return `${name} — last month ${last}, this month ${current}, ${changeBit}, percent missing`;
  }
  if (fig.direction === "flat") {
    return `${name} — last month ${last}, this month ${current}, change 0, ${fig.percentLabel}%`;
  }
  const word = fig.direction === "up" ? "up" : "down";
  return `${name} — last month ${last}, this month ${current}, change ${word} ${formatNumber(Math.abs(fig.change))}, ${fig.percentLabel}%`;
}
