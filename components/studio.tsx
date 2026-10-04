"use client";

import { useEffect, useState } from "react";

import { ReportView, type Draft } from "@/components/report-view";
import { SAMPLE_CLIENT, SAMPLE_CSV, SAMPLE_PERIOD } from "@/lib/sample";
import type { ReportResponse } from "@/lib/types";

type Status = { mode: "demo" | "model"; model: string | null };
type SheetInput = { csv: string; client: string; period: string };

export function Studio() {
  const [client, setClient] = useState("");
  const [period, setPeriod] = useState("");
  const [csv, setCsv] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhase] = useState<"idle" | "working" | "ready">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResponse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/report")
      .then((response) => response.json())
      .then((data: Status) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus({ mode: "demo", model: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (generation === 0) return;
    document.getElementById("report-title")?.focus();
  }, [generation]);

  const fallback = Boolean(result && status?.mode === "model" && result.mode === "demo");
  const live = result ? result.mode === "model" : status?.mode === "model";
  const chip = fallback
    ? "Demo mode · local fallback"
    : result?.mode === "model" && result.model
      ? `Live model · OpenAI ${result.model}`
      : status?.mode === "model" && status.model
        ? `Live model ready · OpenAI ${status.model}`
        : status
          ? "Demo mode · local rewrite"
          : "Checking mode…";
  const modeDetail = fallback
    ? "The model was not used for this report. The text below is the local rewrite."
    : live
      ? "A key is set on the server. The report says a model wrote it only when that draft really used one."
      : "No API key in use. The report is written on this computer from your rows. The same sheet always makes the same report.";

  const stale = Boolean(
    result && (result.sourceCsv !== csv || result.client !== client.trim() || result.period !== period.trim()),
  );

  async function writeReport(input: SheetInput) {
    setError(null);
    setNotice(null);
    setResult(null);
    setDraft(null);
    if (!input.csv.trim()) {
      setPhase("idle");
      setError("Paste a CSV or load the sample first.");
      return;
    }
    setPhase("working");
    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = (await response.json().catch(() => ({}))) as ReportResponse & { error?: string };
      if (!response.ok) {
        setError(data.error ?? "That did not work. Try the sample sheet.");
        setPhase("idle");
        return;
      }
      setResult(data);
      setDraft({
        whatChanged: data.whatChanged,
        whyItMatters: data.whyItMatters,
        nextActions: data.nextActions,
      });
      setNotice(data.notice);
      setPhase("ready");
      setGeneration((value) => value + 1);
    } catch {
      setError("The app could not reach its own server. Refresh the page and try again.");
      setPhase("idle");
    }
  }

  function loadSample() {
    setClient(SAMPLE_CLIENT);
    setPeriod(SAMPLE_PERIOD);
    setCsv(SAMPLE_CSV);
    setError(null);
    void writeReport({ csv: SAMPLE_CSV, client: SAMPLE_CLIENT, period: SAMPLE_PERIOD });
  }

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 100_000) {
      setError("That file is too big for this demo. Use a small monthly CSV.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setCsv(text);
      setResult(null);
      setDraft(null);
      setPhase("idle");
      setError(null);
      setNotice(text.trim() ? "CSV loaded. Write the report when the rows look right." : "That file was empty. Paste the CSV instead.");
    };
    reader.onerror = () => setError("That file could not be read. Paste the CSV instead.");
    reader.readAsText(file);
  }

  return (
    <>
      <div className="glow glow-a" aria-hidden="true" />
      <div className="glow glow-b" aria-hidden="true" />
      <div className="glow glow-c" aria-hidden="true" />
      <div className="shell">
        <a className="skip" href="#sheet">
          Skip to the sheet
        </a>
        <header className="topbar">
          <a className="brand" href="#sheet">
            <span className="mark" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
                <path d="M8 22V16M16 22V10M24 22V7" stroke="#fff8f0" strokeWidth="2.8" strokeLinecap="round" />
              </svg>
            </span>
            <span className="brand-name">Narrator</span>
          </a>
          <span className="chip">
            <i />
            {chip}
          </span>
        </header>

        <main>
          <section className="hero">
            <h1>Client Report Narrator</h1>
            <p className="deck">
              Paste one month of client numbers. Read what changed, why it matters, and what to do next. Every figure
              comes from the sheet.
            </p>
            <p className="mode-detail">{modeDetail}</p>
          </section>

          <form
            id="sheet"
            className="panel"
            onSubmit={(event) => {
              event.preventDefault();
              void writeReport({ csv, client, period });
            }}
          >
            <h2>Your sheet</h2>
            <p className="lede">One row per channel and metric. Leave a cell blank when you do not have the figure.</p>
            <div className="actions">
              <button type="button" className="secondary" onClick={loadSample} disabled={phase === "working"}>
                Load sample
              </button>
              <label className="file">
                Upload CSV
                <input type="file" accept=".csv,text/csv,text/plain" onChange={onFile} />
              </label>
              <button type="submit" className="primary" disabled={phase === "working"}>
                {phase === "working" ? "Writing…" : "Write the report"}
              </button>
            </div>
            <div className="field">
              <label htmlFor="client">Client</label>
              <input
                id="client"
                type="text"
                value={client}
                onChange={(event) => setClient(event.target.value)}
                placeholder="Client name"
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="period">Period</label>
              <input
                id="period"
                type="text"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                placeholder="This month compared with last month"
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="csv">Monthly numbers</label>
              <textarea
                id="csv"
                className="source-box"
                value={csv}
                onChange={(event) => setCsv(event.target.value)}
                placeholder={"channel,metric,last_month,this_month\nPaid search,Spend,3800,4200"}
                spellCheck={false}
              />
              <p className="help">
                Columns: channel, metric, last_month, this_month. Plain numbers are enough. A blank cell means that
                figure is missing.
              </p>
            </div>
          </form>

          <section className="stage" aria-live="polite">
            {error ? (
              <p className="alert" role="alert">
                {error}
              </p>
            ) : null}
            {notice && phase !== "working" ? <p className={fallback ? "banner" : "note"}>{notice}</p> : null}
            {stale ? (
              <p className="note">The sheet has changed. Write the report again so every figure matches the rows above.</p>
            ) : null}
            {phase === "working" ? (
              <p className="reading" role="status">
                <span className="pulse" />
                Reading the sheet…
              </p>
            ) : null}
            {result && draft ? (
              <ReportView report={result} draft={draft} onChange={setDraft} />
            ) : phase === "working" ? null : (
              <div className="empty">
                <h2>The report sits under the sheet</h2>
                <p className="lede">Load the sample, or paste your own month. The page stays empty until you write it.</p>
                <div className="ghosts">
                  <div>
                    <strong>What changed</strong>
                    <span>Each metric, last month and this month, in plain sentences.</span>
                  </div>
                  <div>
                    <strong>Why it matters</strong>
                    <span>Which move is the large one, using only these rows.</span>
                  </div>
                  <div>
                    <strong>Next actions</strong>
                    <span>A short list you can edit and copy. Missing figures stay missing.</span>
                  </div>
                </div>
              </div>
            )}
          </section>

          <footer className="site-foot">
            <div>
              <strong>Client Report Narrator</strong>
              <p>A portfolio demo. The report stays on this page. It is not sent to a client.</p>
            </div>
            <p>The number list under the report is there so you can check every figure against the sheet.</p>
          </footer>
        </main>
      </div>
    </>
  );
}
