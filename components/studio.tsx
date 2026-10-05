"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { ReportView, type Draft } from "@/components/report-view";
import { previewSheet, SheetError, type Row, type SheetPreview } from "@/lib/csv";
import { SAMPLE_CLIENT, SAMPLE_CSV, SAMPLE_PERIOD } from "@/lib/sample";
import type { ReportResponse } from "@/lib/types";

type Status = { mode: "demo" | "model"; model: string | null };
type SheetInput = { csv: string; client: string; period: string };
type SheetProblemNotice = { label: string; message: string };
type FocusRequest = { kind: "preview" | "problem"; n: number };

const PREVIEW_LIMIT = 12;

export function Studio() {
  const [client, setClient] = useState("");
  const [period, setPeriod] = useState("");
  const [csv, setCsv] = useState("");
  const [origin, setOrigin] = useState<{ label: string; csv: string } | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);
  const [fileProblem, setFileProblem] = useState<SheetProblemNotice | null>(null);
  const [revealProblem, setRevealProblem] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [phase, setPhase] = useState<"idle" | "working" | "ready">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<ReportResponse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [generation, setGeneration] = useState(0);
  const [sheetFocus, setSheetFocus] = useState<FocusRequest | null>(null);
  const focusNonce = useRef(0);

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

  useEffect(() => {
    if (!sheetFocus) return;
    const id = sheetFocus.kind === "preview" ? "sheet-preview" : "sheet-problem";
    document.getElementById(id)?.focus();
  }, [sheetFocus]);

  function requestFocus(kind: "preview" | "problem") {
    focusNonce.current += 1;
    setSheetFocus({ kind, n: focusNonce.current });
  }

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

  let parsed: { ok: true; sheet: SheetPreview } | { ok: false; message: string } | null = null;
  if (csv.trim()) {
    try {
      parsed = { ok: true, sheet: previewSheet(csv) };
    } catch (caught) {
      parsed = {
        ok: false,
        message: caught instanceof SheetError ? caught.message : "That sheet could not be read.",
      };
    }
  }

  const sheetLabel = !csv.trim() ? null : origin && origin.csv === csv ? origin.label : "Pasted CSV";
  const problem =
    fileProblem ??
    (parsed && !parsed.ok && revealProblem
      ? { label: sheetLabel ?? "This CSV", message: parsed.message }
      : null);
  const busy = phase === "working";

  function clearSheetFlags() {
    setError(null);
    setNotice(null);
    setFileProblem(null);
    setRevealProblem(false);
    setShowAllRows(false);
  }

  async function writeReport(input: SheetInput) {
    setError(null);
    setNotice(null);
    setResult(null);
    setDraft(null);
    if (!input.csv.trim()) {
      setPhase("idle");
      if (fileProblem) {
        requestFocus("problem");
        return;
      }
      setError("Choose a CSV, paste one, or load the sample first.");
      return;
    }
    try {
      previewSheet(input.csv);
    } catch {
      setPhase("idle");
      setShowRaw(false);
      setRevealProblem(true);
      requestFocus("problem");
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
    setOrigin({ label: "Sample sheet", csv: SAMPLE_CSV });
    setShowRaw(false);
    clearSheetFlags();
    void writeReport({ csv: SAMPLE_CSV, client: SAMPLE_CLIENT, period: SAMPLE_PERIOD });
  }

  function onCsvChange(value: string) {
    setCsv(value);
    setFileProblem(null);
    setRevealProblem(false);
  }

  function rejectFile(label: string, message: string) {
    setCsv("");
    setOrigin(null);
    setResult(null);
    setDraft(null);
    setPhase("idle");
    setShowRaw(false);
    setError(null);
    setNotice(null);
    setRevealProblem(false);
    setShowAllRows(false);
    setFileProblem({ label, message });
    requestFocus("problem");
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 100_000) {
      rejectFile(file.name, "That file is too big for this demo. Use a small monthly CSV, about 40 rows.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      if (!text.trim()) {
        rejectFile(file.name, "That file was empty. It needs a header row and at least one data row.");
        return;
      }
      let readable = true;
      try {
        previewSheet(text);
      } catch {
        readable = false;
      }
      setCsv(text);
      setOrigin({ label: file.name, csv: text });
      setResult(null);
      setDraft(null);
      setPhase("idle");
      setShowRaw(false);
      setShowAllRows(false);
      setError(null);
      setNotice(null);
      setFileProblem(null);
      setRevealProblem(!readable);
      requestFocus(readable ? "preview" : "problem");
    };
    reader.onerror = () => {
      rejectFile(file.name, "That file could not be read. Choose another CSV, or load the sample.");
    };
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
            <div className="hero-copy">
              <p className="deck">
                Paste or upload one month of client numbers. Read what changed, why it matters, and what to do next.
                Every figure comes from the sheet.
              </p>
              <p className="mode-detail">{modeDetail}</p>
            </div>
          </section>

          <div className="workspace">
            <form
              id="sheet"
              className="panel"
              onSubmit={(event) => {
                event.preventDefault();
                void writeReport({ csv, client, period });
              }}
            >
              <h2>Your sheet</h2>
              <p className="lede" id="csv-help">
                Choose a .csv with the columns channel, metric, last_month, and this_month. After it loads, check the
                file name and the channels, then write the report.
              </p>

              {problem ? (
                <SheetProblem notice={problem} busy={busy} onSample={loadSample} />
              ) : parsed?.ok ? (
                <SheetPreview
                  label={sheetLabel ?? "CSV"}
                  sheet={parsed.sheet}
                  showAllRows={showAllRows}
                  onShowAll={() => setShowAllRows(true)}
                />
              ) : (
                <FormatCard />
              )}

              <div className="actions">
                <label className="file">
                  {csv.trim() ? "Replace CSV" : "Choose a CSV"}
                  <input
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    aria-describedby="csv-help"
                    onChange={onFile}
                    disabled={busy}
                  />
                </label>
                <button type="button" className="secondary" onClick={loadSample} disabled={busy}>
                  Load sample
                </button>
                <button type="submit" className="primary" disabled={busy}>
                  {busy ? "Writing…" : "Write the report"}
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
              {showRaw ? (
                <div className="field">
                  <label htmlFor="csv">Paste or edit the CSV</label>
                  <textarea
                    id="csv"
                    className="source-box"
                    value={csv}
                    onChange={(event) => onCsvChange(event.target.value)}
                    placeholder={"channel,metric,last_month,this_month\nPaid search,Spend,3800,4200"}
                    spellCheck={false}
                    wrap="soft"
                  />
                  <p className="help">
                    {parsed && !parsed.ok
                      ? parsed.message
                      : "Same four columns. A blank cell means that figure is missing."}
                  </p>
                  <button type="button" className="secondary paste-toggle" onClick={() => setShowRaw(false)}>
                    Hide CSV text
                  </button>
                </div>
              ) : (
                <button type="button" className="secondary paste-toggle" onClick={() => setShowRaw(true)}>
                  {csv.trim() ? "Edit the CSV" : "Paste a CSV instead"}
                </button>
              )}
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
                  <h2>The report shows up here</h2>
                  <p className="lede">
                    Load the sample, paste a CSV, or choose a file. The page stays empty until you write the report.
                  </p>
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
          </div>

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

function FormatCard() {
  return (
    <div className="format-card" id="csv-format">
      <p className="kicker">Before you choose a file</p>
      <ColumnGuide />
    </div>
  );
}

function SheetProblem({
  notice,
  busy,
  onSample,
}: {
  notice: SheetProblemNotice;
  busy: boolean;
  onSample: () => void;
}) {
  return (
    <div className="shape-error" id="sheet-problem" role="alert" tabIndex={-1}>
      <p className="kicker">What went wrong</p>
      <p className="problem-title">{notice.label}</p>
      <p>{notice.message}</p>
      <ColumnGuide />
      <button type="button" className="secondary" onClick={onSample} disabled={busy}>
        Load the sample instead
      </button>
    </div>
  );
}

function SheetPreview({
  label,
  sheet,
  showAllRows,
  onShowAll,
}: {
  label: string;
  sheet: SheetPreview;
  showAllRows: boolean;
  onShowAll: () => void;
}) {
  const visible = showAllRows || sheet.rows.length <= PREVIEW_LIMIT ? sheet.rows : sheet.rows.slice(0, PREVIEW_LIMIT);
  const hidden = sheet.rows.length - visible.length;
  const groups = groupRows(visible);

  return (
    <div className="confirm" id="sheet-preview" tabIndex={-1}>
      <p className="kicker">File ready</p>
      <p className="file-name">{label}</p>
      <p className="confirm-stats">
        {formatCount(sheet.rowCount, "row")} · {formatCount(sheet.channels.length, "channel")}
      </p>
      <p className="channel-line">{sheet.channels.join(", ")}</p>
      <p className="help">Next, tap Write the report. Replace the file if these are the wrong rows.</p>
      <ul className="preview-list">
        {groups.map((group) => (
          <li key={group.key}>
            <p className="channel-name">{group.channel}</p>
            <ul>
              {group.rows.map((entry) => (
                <li key={entry.index} className="metric-line">
                  <span className="metric-name">{entry.row.metric}</span>
                  <span className="metric-values">
                    last month {cellText(entry.row.lastMonth)}, this month {cellText(entry.row.thisMonth)}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <button type="button" className="secondary" onClick={onShowAll}>
          Show {formatCount(hidden, "more row")}
        </button>
      ) : null}
    </div>
  );
}

function ColumnGuide() {
  return (
    <>
      <p className="kicker">Expected columns</p>
      <ul className="col-names">
        <li>channel</li>
        <li>metric</li>
        <li>last_month</li>
        <li>this_month</li>
      </ul>
      <dl className="example-grid">
        <div>
          <dt>channel</dt>
          <dd>Paid search</dd>
        </div>
        <div>
          <dt>metric</dt>
          <dd>Spend</dd>
        </div>
        <div>
          <dt>last_month</dt>
          <dd>3800</dd>
        </div>
        <div>
          <dt>this_month</dt>
          <dd>4200</dd>
        </div>
      </dl>
      <p className="help">
        One row per channel and metric. Leave a cell blank when that figure is missing. campaign, kpi, previous, and
        current are other names for the same columns.
      </p>
    </>
  );
}

function cellText(value: number | null): string {
  return value === null ? "missing" : String(value);
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function groupRows(rows: Row[]): { key: string; channel: string; rows: { row: Row; index: number }[] }[] {
  const groups: { key: string; channel: string; rows: { row: Row; index: number }[] }[] = [];
  rows.forEach((row, index) => {
    const last = groups[groups.length - 1];
    if (last && last.channel === row.channel) {
      last.rows.push({ row, index });
      return;
    }
    groups.push({ key: `${row.channel}-${index}`, channel: row.channel, rows: [{ row, index }] });
  });
  return groups;
}
