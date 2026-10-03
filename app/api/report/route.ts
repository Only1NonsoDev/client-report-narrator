import { draftWithModel, parseModelReport, resolveReport } from "@/lib/model";
import { narrateLocal, SheetError } from "@/lib/narrate";
import type { ReportResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export async function GET(): Promise<Response> {
  const key = process.env.OPENAI_API_KEY?.trim() ?? "";
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  return json({ mode: key ? "model" : "demo", model: key ? model : null });
}

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Send the sheet as JSON." }, 400);
  }

  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const csv = typeof body.csv === "string" ? body.csv : "";
  const client = typeof body.client === "string" ? body.client : "";
  const period = typeof body.period === "string" ? body.period : "";

  try {
    const local = narrateLocal(csv, client, period);
    const key = process.env.OPENAI_API_KEY?.trim() ?? "";
    const modelName = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
    const usedClient = client.trim();
    const usedPeriod = period.trim();

    if (!key) {
      return json(toResponse(local, resolveReport(local, null, null), null, csv, usedClient, usedPeriod));
    }

    try {
      const raw = await draftWithModel({
        csv,
        client: usedClient,
        period: usedPeriod,
        local,
        apiKey: key,
        model: modelName,
      });
      const parsed = parseModelReport(raw);
      const resolved = resolveReport(
        local,
        parsed,
        parsed ? null : "The model reply could not be read, so this report uses the local rewrite.",
      );
      return json(toResponse(local, resolved, resolved.mode === "model" ? modelName : null, csv, usedClient, usedPeriod));
    } catch {
      const resolved = resolveReport(local, null, "The model did not answer, so this report uses the local rewrite.");
      return json(toResponse(local, resolved, null, csv, usedClient, usedPeriod));
    }
  } catch (error) {
    if (error instanceof SheetError) return json({ error: error.message }, 400);
    return json({ error: "The report could not be written. Check the sheet and try again." }, 400);
  }
}

function toResponse(
  local: ReturnType<typeof narrateLocal>,
  resolved: ReturnType<typeof resolveReport>,
  model: string | null,
  sourceCsv: string,
  client: string,
  period: string,
): ReportResponse {
  return {
    mode: resolved.mode,
    model,
    notice: resolved.notice,
    clientLine: local.clientLine,
    periodLine: local.periodLine,
    whatChanged: resolved.whatChanged,
    whyItMatters: resolved.whyItMatters,
    nextActions: resolved.nextActions,
    audit: local.audit,
    sourceCsv,
    client,
    period,
  };
}
