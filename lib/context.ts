import { SheetError } from "./csv";
import type { ContextInput, Note, SectionKey } from "./types";

export const SECTIONS: {
  key: SectionKey;
  label: string;
  tag: Note["tag"];
  help: string;
  placeholder: string;
  prompt: string;
}[] = [
  {
    key: "campaign",
    label: "Campaign change log",
    tag: "campaign",
    help: "What you changed in the account this month. One per line.",
    placeholder: "Edinburgh - Generic: Paused the broad-match ad group on 8 Oct",
    prompt: "Add campaign notes to unlock why",
  },
  {
    key: "seasonality",
    label: "Seasonality and events",
    tag: "seasonality",
    help: "Holidays, events, weather, anything that moves demand.",
    placeholder: "Edinburgh: School half-term lifted city-break searches",
    prompt: "Add seasonality or events to explain timing",
  },
  {
    key: "site",
    label: "Site and SEO notes",
    tag: "site",
    help: "Releases, outages, tracking changes, ranking changes.",
    placeholder: "Manchester: Booking engine threw checkout errors on 20-22 Oct",
    prompt: "Add site or SEO notes to rule site causes in or out",
  },
  {
    key: "goals",
    label: "Client goals",
    tag: "client note",
    help: "What the client said they care about.",
    placeholder: "all: Priority this quarter is Manchester bookings",
    prompt: "Add client goals to judge whether this month is on track",
  },
];

export const EMPTY_CONTEXT: ContextInput = { campaign: "", seasonality: "", site: "", goals: "" };

const MAX_LINES = 25;
const MAX_LINE = 240;
const ACCOUNT_WIDE = /^(all|account|everything|general)$/i;

export function squash(value: string): string {
  return value
    .toLowerCase()
    .replace(/[–—\-·|/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when a scope such as "Edinburgh" or "Edinburgh generic" names this channel. */
export function scopeMatches(channel: string, scope: string): boolean {
  const wanted = squash(scope);
  return wanted !== "" && squash(channel).includes(wanted);
}

export function parseContext(input: ContextInput, channels: string[]): { notes: Note[]; warnings: string[] } {
  const notes: Note[] = [];
  const warnings: string[] = [];

  for (const section of SECTIONS) {
    const lines = (input[section.key] ?? "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) => line.replace(/^\s*(?:[-*•]\s+)/, "").trim())
      .filter(Boolean);

    if (lines.length > MAX_LINES) {
      throw new SheetError(`${section.label} has more than ${MAX_LINES} lines. Keep the ones that matter this month.`);
    }

    for (const line of lines) {
      if (line.length > MAX_LINE) {
        throw new SheetError(`Keep each note in ${section.label} under ${MAX_LINE} characters.`);
      }
      const parsed = readScope(line, channels);
      const text = parsed.text.replace(/[“”"]/g, "'");
      if (parsed.unmatched) {
        warnings.push(
          `${section.label}: "${parsed.unmatched}" does not match any channel on the sheet, so that note is not tied to a row. Use a channel name, or "all:" for the whole account.`,
        );
      }
      notes.push({
        id: `n${notes.length + 1}`,
        section: section.key,
        tag: section.tag,
        scope: parsed.scope,
        linked: !parsed.unmatched,
        text,
      });
    }
  }
  return { notes, warnings };
}

function readScope(
  line: string,
  channels: string[],
): { scope: string | null; text: string; unmatched: string | null } {
  const found = /^([^:]{1,60}):\s*(.+)$/.exec(line);
  if (!found) return { scope: null, text: line, unmatched: null };

  const prefix = found[1].trim();
  const rest = found[2].trim();
  if (ACCOUNT_WIDE.test(prefix)) return { scope: null, text: rest, unmatched: null };
  if (channels.some((channel) => scopeMatches(channel, prefix))) return { scope: prefix, text: rest, unmatched: null };

  // A short label with no digits looks like a scope the writer meant; anything else is prose with a colon in it.
  const looksLikeScope = prefix.split(/\s+/).length <= 3 && !/\d/.test(prefix);
  return looksLikeScope ? { scope: prefix, text: rest, unmatched: prefix } : { scope: null, text: line, unmatched: null };
}

export function contextHasNotes(input: ContextInput): boolean {
  return SECTIONS.some((section) => (input[section.key] ?? "").trim() !== "");
}
