import { EMPTY_CONTEXT, SECTIONS } from "@/lib/context";
import { buildReview, SheetError } from "@/lib/review";
import type { ContextInput, ReviewResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function readContext(value: unknown): ContextInput {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const context: ContextInput = { ...EMPTY_CONTEXT };
  for (const section of SECTIONS) {
    const text = source[section.key];
    context[section.key] = typeof text === "string" ? text : "";
  }
  return context;
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
  const context = readContext(body.context);

  try {
    const review = buildReview(csv, client, period, context);
    const response: ReviewResponse = {
      ...review,
      sourceCsv: csv,
      sourceContext: context,
      client: client.trim(),
      period: period.trim(),
    };
    return json(response);
  } catch (error) {
    if (error instanceof SheetError) return json({ error: error.message }, 400);
    return json({ error: "The review could not be written. Check the sheet and try again." }, 400);
  }
}
