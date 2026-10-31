import { parseContext, scopeMatches, SECTIONS } from "./context";
import { parseSheet, SheetError, type Row } from "./csv";
import { allowedNumbers, formatNumber, percentLabel, percentPoints, roundMeasure } from "./ground";
import type { ContextInput, Direction, Evidence, Figure, Note, Prompt, Review, Sentence } from "./types";

export { SheetError };

const MOVER_COUNT = 4;
const NOTES_PER_MOVER = 3;
const ACTION_COUNT = 3;
const SECTION_ORDER = SECTIONS.map((section) => section.key);

export function buildReview(csv: string, client: string, period: string, context: ContextInput): Review {
  const name = client.trim();
  const label = period.trim();
  if (name.length > 80) throw new SheetError("Keep the client name under 80 characters.");
  if (label.length > 80) throw new SheetError("Keep the period label under 80 characters.");

  const figures = parseSheet(csv).map((row, order) => toFigure(row, order));
  const channels = [...new Set(figures.map((fig) => fig.channel))];
  const { notes, warnings } = parseContext(context, channels);

  const movers = pickMovers(figures);
  const drivers = new Map<string, Note[]>(movers.map((fig) => [fig.id, notesFor(fig, notes)]));

  const moved = buildMoved(figures, movers);
  const why = buildWhy(movers, drivers);
  const next = buildNext(figures, movers, drivers, notes);

  return {
    clientLine: name ? name : "Client name is missing.",
    periodLine: label ? label : "Period label is missing.",
    figures,
    notes,
    moved,
    why,
    next,
    prompts: promptsFor(context),
    warnings,
    allowed: [...allowedNumbers(figures, `${name}\n${label}`)],
    quoteSource: notes.map((note) => note.text).join("\n"),
  };
}

function toFigure(row: Row, order: number): Figure {
  const comparable = row.lastMonth !== null && row.thisMonth !== null;
  const change = comparable ? roundMeasure(row.thisMonth! - row.lastMonth!) : null;
  const points = comparable ? percentPoints(row.lastMonth!, row.thisMonth!) : null;
  return {
    id: `r${order + 1}`,
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

function metricName(metric: string): string {
  return metric === metric.toUpperCase() ? metric : metric.charAt(0).toLowerCase() + metric.slice(1);
}

function rowName(fig: Figure): string {
  return `${fig.channel} ${metricName(fig.metric)}`;
}

function verb(fig: Figure): string {
  return fig.direction === "up" ? "up" : "down";
}

function pickMovers(figures: Figure[]): Figure[] {
  return figures
    .filter((fig) => (fig.direction === "up" || fig.direction === "down") && fig.percentPoints !== null)
    .sort((a, b) => Math.abs(b.percentPoints!) - Math.abs(a.percentPoints!) || a.order - b.order)
    .slice(0, MOVER_COUNT);
}

function evidenceRow(fig: Figure): Evidence {
  return { kind: "row", id: fig.id };
}

function evidenceNote(note: Note): Evidence {
  return { kind: "note", id: note.id };
}

function buildMoved(figures: Figure[], movers: Figure[]): Sentence[] {
  const out: Sentence[] = [];
  const add = (text: string, evidence: Evidence[]) =>
    out.push({ id: `m${out.length + 1}`, text, tag: null, evidence });

  if (!figures.some((fig) => fig.lastMonth !== null && fig.thisMonth !== null)) {
    add("No row has both months filled in, so nothing can be ranked.", figures.map(evidenceRow));
  } else if (!movers.length) {
    const open = figures.some((fig) => fig.direction === "up" || fig.direction === "down");
    add(
      open
        ? "Rows moved, but each percent change is missing because last month is 0, so none can be ranked."
        : "Nothing moved: every row with both months is flat.",
      [],
    );
  }

  for (const fig of movers) {
    const word = fig.direction === "up" ? "rose" : "fell";
    add(
      `${rowName(fig)} ${word} ${fig.percentLabel}%, from ${formatNumber(fig.lastMonth!)} to ${formatNumber(fig.thisMonth!)}.`,
      [evidenceRow(fig)],
    );
  }

  for (const fig of figures) {
    const evidence = [evidenceRow(fig)];
    if (fig.lastMonth === null && fig.thisMonth === null) {
      add(`${rowName(fig)} is missing for both months, so the change is missing.`, evidence);
    } else if (fig.lastMonth === null) {
      add(
        `${rowName(fig)} is ${formatNumber(fig.thisMonth!)} this month. Last month is missing, so the change is missing.`,
        evidence,
      );
    } else if (fig.thisMonth === null) {
      add(
        `${rowName(fig)} was ${formatNumber(fig.lastMonth)} last month. This month is missing, so the change is missing.`,
        evidence,
      );
    } else if (fig.percentLabel === null && fig.direction !== "flat") {
      add(
        `${rowName(fig)} moved from ${formatNumber(fig.lastMonth)} to ${formatNumber(fig.thisMonth)}. The percent change is missing because last month is 0.`,
        evidence,
      );
    }
  }
  return out;
}

/** Notes that name this row's channel come first, then whole-account notes. Within each, the sections keep their order. */
function notesFor(fig: Figure, notes: Note[]): Note[] {
  const rank = (note: Note) => (note.scope === null ? 1 : 0);
  return notes
    .filter((note) => note.linked && (note.scope === null || scopeMatches(fig.channel, note.scope)))
    .sort(
      (a, b) =>
        rank(a) - rank(b) || SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) || a.id.localeCompare(b.id),
    )
    .slice(0, NOTES_PER_MOVER);
}

const CLAUSE: Record<Note["tag"], (text: string) => string> = {
  campaign: (text) => `the campaign log says “${text}”. Confirm this change accounts for the move.`,
  seasonality: (text) =>
    `the seasonality note says “${text}”. Timing may explain part of it; the sheet alone cannot say how much.`,
  site: (text) => `the site note says “${text}”. Check it against the dates the move started.`,
  "client note": (text) => `the client note says “${text}”. Read the move against it.`,
};

function checkFor(metric: string): string {
  if (/spend|cost|budget|pacing/i.test(metric)) return "budget changes and pacing in the ad account";
  if (/roas|cpa|conversion|booking|revenue|lead|sale|order/i.test(metric)) {
    return "search terms, landing pages and conversion tracking";
  }
  if (/click|impression|ctr|cpc|traffic|session/i.test(metric)) return "bid and budget changes and auction insights";
  return "what changed in the account that month";
}

function buildWhy(movers: Figure[], drivers: Map<string, Note[]>): Sentence[] {
  const out: Sentence[] = [];
  for (const fig of movers) {
    const head = `${rowName(fig)} (${verb(fig)} ${fig.percentLabel}%)`;
    const notes = drivers.get(fig.id) ?? [];
    if (!notes.length) {
      out.push({
        id: `w${out.length + 1}`,
        text: `${head}: nothing in the context pack covers ${fig.channel}, so the reason is unknown. Check ${checkFor(fig.metric)}.`,
        tag: "unknown",
        evidence: [evidenceRow(fig)],
      });
      continue;
    }
    for (const note of notes) {
      out.push({
        id: `w${out.length + 1}`,
        text: `${head}: ${CLAUSE[note.tag](note.text)}`,
        tag: note.tag,
        evidence: [evidenceRow(fig), evidenceNote(note)],
      });
    }
  }
  return out;
}

function buildNext(figures: Figure[], movers: Figure[], drivers: Map<string, Note[]>, notes: Note[]): Sentence[] {
  const out: Sentence[] = [];
  const add = (text: string, tag: Sentence["tag"], evidence: Evidence[]) => {
    if (out.length < ACTION_COUNT) out.push({ id: `a${out.length + 1}`, text, tag, evidence });
  };

  for (const fig of movers) {
    const note = (drivers.get(fig.id) ?? [])[0];
    const label = rowName(fig);
    if (!note) {
      add(
        `Find out what changed in ${fig.channel} and check ${checkFor(fig.metric)}, because ${label} moved with no sourced reason.`,
        "unknown",
        [evidenceRow(fig)],
      );
      continue;
    }
    const evidence = [evidenceRow(fig), evidenceNote(note)];
    if (note.tag === "campaign") {
      add(`Decide with the client whether “${note.text}” stays in place, then watch ${label} next month.`, note.tag, evidence);
    } else if (note.tag === "seasonality") {
      add(`Plan ${fig.channel} budget with “${note.text}” in mind, and watch ${label} next month.`, note.tag, evidence);
    } else if (note.tag === "site") {
      add(`Ask the site team to confirm “${note.text}” is resolved, then re-check ${label}.`, note.tag, evidence);
    } else {
      add(`Agree what ${label} should do next month in light of “${note.text}”.`, note.tag, evidence);
    }
  }

  if (!notes.some((note) => note.section === "campaign")) {
    add("Add the campaign change log before the review, so every move has a sourced reason.", null, []);
  }
  const gaps = figures.filter((fig) => fig.lastMonth === null || fig.thisMonth === null);
  if (gaps.length) {
    add(`Ask the client for the missing figures: ${gaps.map(rowName).join("; ")}.`, null, gaps.map(evidenceRow));
  }
  const goal = notes.find((note) => note.section === "goals" && note.linked);
  if (goal) add(`Read the month against the client goal: “${goal.text}”.`, goal.tag, [evidenceNote(goal)]);
  else add("Ask the client for their goals, so next month can be judged against them.", null, []);
  add(
    movers.length ? "Agree which of the moves above to watch next month." : "Agree what to watch next month.",
    null,
    movers.map(evidenceRow),
  );
  return out;
}

function promptsFor(context: ContextInput): Prompt[] {
  return SECTIONS.filter((section) => (context[section.key] ?? "").trim() === "").map((section) => ({
    section: section.key,
    text: section.prompt,
  }));
}
