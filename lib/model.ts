import type { Figure } from "./types";
import { inventedNumbers } from "./ground";
import type { LocalReport } from "./narrate";

export type ModelSections = {
  whatChanged: string;
  whyItMatters: string;
  nextActions: string;
};

export type ResolvedReport = {
  mode: "demo" | "model";
  notice: string | null;
  whatChanged: string;
  whyItMatters: string;
  nextActions: string;
};

const INVENTED =
  "The model added a number that is not in the source, so this report uses the local rewrite.";
const SKIPPED_MISSING = "The model skipped a missing figure, so this report uses the local rewrite.";

export function parseModelReport(value: unknown): ModelSections | null {
  const record = unwrap(value);
  if (!record) return null;
  const whatChanged = clean(record.whatChanged);
  const whyItMatters = clean(record.whyItMatters);
  const nextActions = clean(record.nextActions);
  if (!whatChanged || !whyItMatters || !nextActions) return null;
  if (whatChanged.length > 6000 || whyItMatters.length > 6000 || nextActions.length > 6000) return null;
  return { whatChanged, whyItMatters, nextActions };
}

function unwrap(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    const stripped = value.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
      return unwrap(JSON.parse(stripped) as unknown);
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

export function modelReportProblem(sections: ModelSections, allowed: Set<string>, figures: Figure[]): string | null {
  const text = `${sections.whatChanged}\n${sections.whyItMatters}\n${sections.nextActions}`;
  if (inventedNumbers(text, allowed).length > 0) return INVENTED;
  const missing = figures.some((fig) => fig.lastMonth === null || fig.thisMonth === null);
  if (missing && !/missing/i.test(text)) return SKIPPED_MISSING;
  return null;
}

export function resolveReport(local: LocalReport, modelSections: ModelSections | null, modelError: string | null): ResolvedReport {
  const localSections = {
    whatChanged: local.whatChanged,
    whyItMatters: local.whyItMatters,
    nextActions: local.nextActions,
  };
  if (!modelSections) {
    return { mode: "demo", notice: modelError, ...localSections };
  }
  const problem = modelReportProblem(modelSections, local.allowed, local.figures);
  if (problem) return { mode: "demo", notice: problem, ...localSections };
  return { mode: "model", notice: null, ...modelSections };
}

export async function draftWithModel(input: {
  csv: string;
  client: string;
  period: string;
  local: LocalReport;
  apiKey: string;
  model: string;
}): Promise<unknown> {
  const figures = input.local.figures.map((fig) => ({
    channel: fig.channel,
    metric: fig.metric,
    lastMonth: fig.lastMonth === null ? "missing" : fig.lastMonth,
    thisMonth: fig.thisMonth === null ? "missing" : fig.thisMonth,
    change: fig.change,
    percent: fig.percentLabel,
  }));

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(25000),
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You rewrite a monthly client report into plain English.",
            "Use only the numbers in the figure list. Copy them exactly.",
            "You may describe a change or a one-decimal percent only when that figure list already includes it.",
            "Never add a benchmark, a goal, a cost, or any other statistic.",
            "If a figure is missing, the report must say it is missing. Do not fill it in.",
            'Return JSON only: {"whatChanged":"","whyItMatters":"","nextActions":""}',
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            client: input.client,
            period: input.period,
            figures,
            localReport: {
              whatChanged: input.local.whatChanged,
              whyItMatters: input.local.whyItMatters,
              nextActions: input.local.nextActions,
            },
            sheet: input.csv.slice(0, 12000),
          }),
        },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Model status ${response.status}`);
  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("Model returned an empty message");
  return JSON.parse(content) as unknown;
}
