"use client";

import { useState } from "react";

import type { ReportBody } from "@/lib/types";

export type Draft = {
  whatChanged: string;
  whyItMatters: string;
  nextActions: string;
};

function reportText(clientLine: string, periodLine: string, draft: Draft): string {
  return [
    clientLine,
    periodLine,
    "",
    "What changed",
    draft.whatChanged.trim(),
    "",
    "Why it matters",
    draft.whyItMatters.trim(),
    "",
    "Next actions",
    draft.nextActions.trim(),
  ].join("\n");
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <button
      type="button"
      className="copy"
      onClick={() => {
        navigator.clipboard
          .writeText(text)
          .then(() => setDone("copied"))
          .catch(() => setDone("failed"));
        window.setTimeout(() => setDone("idle"), 1600);
      }}
    >
      {done === "copied" ? "Copied" : done === "failed" ? "Copy blocked" : "Copy report"}
    </button>
  );
}

export function ReportView({
  report,
  draft,
  onChange,
}: {
  report: ReportBody;
  draft: Draft;
  onChange: (draft: Draft) => void;
}) {
  const edited =
    draft.whatChanged !== report.whatChanged ||
    draft.whyItMatters !== report.whyItMatters ||
    draft.nextActions !== report.nextActions;
  const lines = report.audit.split("\n").filter((line) => line.trim());

  return (
    <article className="card" id="report" aria-labelledby="report-title">
      <p className="kicker">Plain-English report</p>
      <div className="stage-head">
        <h2 id="report-title" tabIndex={-1}>
          Report
        </h2>
        <CopyButton text={reportText(report.clientLine, report.periodLine, draft)} />
      </div>
      <p className="client-line">{report.clientLine}</p>
      <p className="period-line">{report.periodLine}</p>
      {edited ? <span className="edited">Edited</span> : null}

      <div className="narrative">
        <div className="field field-wide">
          <label htmlFor="what-changed">What changed</label>
          <textarea
            id="what-changed"
            className="editor"
            value={draft.whatChanged}
            onChange={(event) => onChange({ ...draft, whatChanged: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="why">Why it matters</label>
          <textarea
            id="why"
            className="editor"
            value={draft.whyItMatters}
            onChange={(event) => onChange({ ...draft, whyItMatters: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="actions">Next actions</label>
          <textarea
            id="actions"
            className="editor"
            value={draft.nextActions}
            onChange={(event) => onChange({ ...draft, nextActions: event.target.value })}
          />
        </div>
      </div>

      <h3>Numbers from the sheet</h3>
      <p className="help">Each line is a row you pasted, or the change from last month to this month. Nothing else is added.</p>
      <ul className="audit">
        {lines.map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ul>
    </article>
  );
}
