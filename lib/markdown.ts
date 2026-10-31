import { formatNumber } from "./ground";
import type { Figure, Review, Sentence } from "./types";

function cell(value: number | null): string {
  return value === null ? "missing" : formatNumber(value);
}

function change(fig: Figure): string {
  if (fig.change === null) return "missing";
  if (fig.direction === "flat") return "0";
  return `${fig.direction === "up" ? "+" : "-"}${formatNumber(Math.abs(fig.change))}`;
}

function percent(fig: Figure): string {
  if (fig.percentLabel === null) return "missing";
  return fig.direction === "down" ? `-${fig.percentLabel}%` : `${fig.percentLabel}%`;
}

/** `texts` holds the human's edits, keyed by sentence id. A sentence without an edit keeps its drafted text. */
export function toMarkdown(review: Review, texts: Record<string, string>): string {
  const say = (sentence: Sentence) => (texts[sentence.id] ?? sentence.text).trim();
  const out: string[] = [`# Monthly review: ${review.clientLine}`, "", `_${review.periodLine}_`, ""];

  out.push("## Snapshot", "", "| Channel | Metric | Last month | This month | Change | Percent |", "| --- | --- | --- | --- | --- | --- |");
  for (const fig of review.figures) {
    out.push(
      `| ${fig.channel} | ${fig.metric} | ${cell(fig.lastMonth)} | ${cell(fig.thisMonth)} | ${change(fig)} | ${percent(fig)} |`,
    );
  }

  out.push("", "## What moved", "");
  for (const sentence of review.moved) out.push(`- ${say(sentence)}`);

  out.push("", "## Why", "");
  if (!review.why.length) out.push("- Nothing moved enough to explain.");
  for (const sentence of review.why) out.push(`- **${sentence.tag}**: ${say(sentence)}`);

  out.push("", "## What's next", "");
  review.next.forEach((sentence, index) => out.push(`${index + 1}. ${say(sentence)}`));

  out.push("", "---", "", "_Numbers come from the metrics sheet. Reasons come from the context pack. Reviewed and approved by a person._", "");
  return out.join("\n");
}
