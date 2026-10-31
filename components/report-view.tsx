"use client";

import { useMemo, useState } from "react";

import { SECTIONS } from "@/lib/context";
import { formatNumber, sentenceProblems } from "@/lib/ground";
import { toMarkdown } from "@/lib/markdown";
import type { Evidence, Figure, Note, ReviewResponse, Sentence } from "@/lib/types";

type Edits = Record<string, string>;

const SECTION_LABEL = Object.fromEntries(SECTIONS.map((section) => [section.key, section.label]));

function cell(value: number | null): string {
  return value === null ? "missing" : formatNumber(value);
}

function changeText(fig: Figure): string {
  if (fig.change === null) return "change missing";
  if (fig.direction === "flat") return "no change";
  const sign = fig.direction === "up" ? "+" : "-";
  const pct = fig.percentLabel === null ? "percent missing" : `${sign}${fig.percentLabel}%`;
  return `${sign}${formatNumber(Math.abs(fig.change))} (${pct})`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
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
      {done === "copied" ? "Copied" : done === "failed" ? "Copy blocked" : "Copy markdown"}
    </button>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ReviewView({ review }: { review: ReviewResponse }) {
  const [edits, setEdits] = useState<Edits>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);

  const allowed = useMemo(() => new Set(review.allowed), [review.allowed]);
  const rowById = useMemo(() => new Map(review.figures.map((fig) => [fig.id, fig])), [review.figures]);
  const noteById = useMemo(() => new Map(review.notes.map((note) => [note.id, note])), [review.notes]);

  const editedCount = Object.keys(edits).length;
  const textOf = (sentence: Sentence) => edits[sentence.id] ?? sentence.text;
  const all = [...review.moved, ...review.why, ...review.next];
  const blocked = all.filter((sentence) => sentenceProblems(textOf(sentence), allowed, review.quoteSource).length > 0);
  const markdown = toMarkdown(review, edits);
  const campaignPrompt = review.prompts.find((prompt) => prompt.section === "campaign");

  function save(sentence: Sentence, value: string) {
    const next = { ...edits };
    if (value.trim() === "" || value.trim() === sentence.text) delete next[sentence.id];
    else next[sentence.id] = value.trim();
    setEdits(next);
    setApproved(false);
    setEditing(null);
  }

  function reset(sentence: Sentence) {
    const next = { ...edits };
    delete next[sentence.id];
    setEdits(next);
    setApproved(false);
    setEditing(null);
  }

  function renderList(sentences: Sentence[], ordered: boolean) {
    const items = sentences.map((sentence) => (
      <SentenceItem
        key={sentence.id}
        sentence={sentence}
        text={textOf(sentence)}
        edited={sentence.id in edits}
        open={selected === sentence.id}
        editing={editing === sentence.id}
        allowed={allowed}
        quoteSource={review.quoteSource}
        rowById={rowById}
        noteById={noteById}
        onToggle={() => {
          setSelected(selected === sentence.id ? null : sentence.id);
          setEditing(null);
        }}
        onEdit={() => setEditing(sentence.id)}
        onCancel={() => setEditing(null)}
        onSave={(value) => save(sentence, value)}
        onReset={() => reset(sentence)}
      />
    ));
    return ordered ? <ol className="sentences">{items}</ol> : <ul className="sentences">{items}</ul>;
  }

  const groups: { channel: string; rows: Figure[] }[] = [];
  for (const fig of review.figures) {
    const last = groups[groups.length - 1];
    if (last && last.channel === fig.channel) last.rows.push(fig);
    else groups.push({ channel: fig.channel, rows: [fig] });
  }

  return (
    <article className="card" id="report" aria-labelledby="report-title">
      <p className="kicker">Monthly strategic review</p>
      <div className="stage-head">
        <h2 id="report-title" tabIndex={-1}>
          Review
        </h2>
        <span className={approved ? "status status-ok" : "status"}>{approved ? "Approved" : "Draft"}</span>
      </div>
      <p className="client-line">{review.clientLine}</p>
      <p className="period-line">{review.periodLine}</p>

      {review.prompts.length ? (
        <div className="unlock" role="note">
          <p className="unlock-title">{campaignPrompt ? campaignPrompt.text : "Some context is still missing"}</p>
          <p className="help">
            {campaignPrompt
              ? "Without a change log the review can say what moved, but not why. Each reason below is marked unknown until a note covers it."
              : "Each reason below comes from your notes. These sections are still empty:"}
          </p>
          <ul className="unlock-list">
            {review.prompts.map((prompt) => (
              <li key={prompt.section}>
                <a href={`#ctx-${prompt.section}`}>{prompt.text}</a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {review.warnings.length ? (
        <ul className="warnings">
          {review.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <section className="block" aria-labelledby="h-snapshot">
        <h3 id="h-snapshot">Snapshot</h3>
        <p className="help">Every row from your sheet, this month against last month. Nothing is added.</p>
        <div className="snap">
          {groups.map((group) => (
            <div className="snap-group" key={`${group.channel}-${group.rows[0].id}`}>
              <p className="channel-name">{group.channel}</p>
              <ul>
                {group.rows.map((fig) => (
                  <li key={fig.id} className={`snap-row dir-${fig.direction}`}>
                    <span className="metric-name">{fig.metric}</span>
                    <span className="snap-values">
                      {cell(fig.lastMonth)} → {cell(fig.thisMonth)}
                    </span>
                    <span className="snap-change">{changeText(fig)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="block" aria-labelledby="h-moved">
        <h3 id="h-moved">What moved</h3>
        <p className="help">The biggest percent changes first. Select a line to see its evidence.</p>
        {renderList(review.moved, false)}
      </section>

      <section className="block" aria-labelledby="h-why">
        <h3 id="h-why">Why</h3>
        <p className="help">
          Each reason is tagged with where it came from. A line marked unknown has no note behind it.
        </p>
        {review.why.length ? renderList(review.why, false) : <p className="help">Nothing moved enough to explain.</p>}
      </section>

      <section className="block" aria-labelledby="h-next">
        <h3 id="h-next">What&rsquo;s next</h3>
        <p className="help">Three actions, each tied to a line above.</p>
        {renderList(review.next, true)}
      </section>

      <section className="block approve" aria-labelledby="h-approve">
        <h3 id="h-approve">Edit and approve</h3>
        <p className="help">
          Edit any line, then approve. Copy and download unlock after you approve.
          {editedCount ? ` ${editedCount} ${editedCount === 1 ? "line" : "lines"} edited.` : ""}
        </p>
        {blocked.length ? (
          <p className="alert" role="alert">
            {blocked.length === 1 ? "One line has" : `${blocked.length} lines have`} a number or quote that is not in the
            sheet or the context pack. Fix {blocked.length === 1 ? "it" : "them"} before approving.
          </p>
        ) : null}
        {approved ? (
          <div className="actions">
            <CopyButton text={markdown} />
            <button
              type="button"
              className="secondary"
              onClick={() => download(`monthly-review-${slug(review.clientLine)}.md`, markdown)}
            >
              Download .md
            </button>
            <button type="button" className="secondary" onClick={() => setApproved(false)}>
              Undo approval
            </button>
          </div>
        ) : (
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={blocked.length > 0 || editing !== null}
              onClick={() => setApproved(true)}
            >
              Approve draft
            </button>
          </div>
        )}
      </section>
    </article>
  );
}

function SentenceItem(props: {
  sentence: Sentence;
  text: string;
  edited: boolean;
  open: boolean;
  editing: boolean;
  allowed: Set<string>;
  quoteSource: string;
  rowById: Map<string, Figure>;
  noteById: Map<string, Note>;
  onToggle: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (value: string) => void;
  onReset: () => void;
}) {
  const { sentence, text, edited, open, editing } = props;
  const panelId = `ev-${sentence.id}`;
  return (
    <li className={open ? "sent on" : "sent"}>
      <button type="button" className="sent-btn" aria-expanded={open} aria-controls={panelId} onClick={props.onToggle}>
        {sentence.tag ? <span className={`tag tag-${sentence.tag.replace(" ", "-")}`}>{sentence.tag}</span> : null}
        <span className="sent-text">{text}</span>
        {edited ? <span className="edited">Edited</span> : null}
      </button>
      {open ? (
        <div className="evidence" id={panelId}>
          <p className="kicker">Evidence</p>
          {sentence.evidence.length ? (
            <ul className="ev-list">
              {sentence.evidence.map((item) => (
                <EvidenceItem key={`${item.kind}-${item.id}`} item={item} rowById={props.rowById} noteById={props.noteById} />
              ))}
            </ul>
          ) : (
            <p className="help">
              No sheet row or note sits behind this line. It is a prompt for you, not a finding.
            </p>
          )}
          {editing ? (
            <SentenceEditor
              initial={text}
              allowed={props.allowed}
              quoteSource={props.quoteSource}
              onSave={props.onSave}
              onCancel={props.onCancel}
            />
          ) : (
            <div className="ev-actions">
              <button type="button" className="secondary" onClick={props.onEdit}>
                Edit this line
              </button>
              {edited ? (
                <button type="button" className="secondary" onClick={props.onReset}>
                  Reset to draft
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}

function EvidenceItem({
  item,
  rowById,
  noteById,
}: {
  item: Evidence;
  rowById: Map<string, Figure>;
  noteById: Map<string, Note>;
}) {
  if (item.kind === "row") {
    const fig = rowById.get(item.id);
    if (!fig) return null;
    return (
      <li>
        <span className="ev-kind">Sheet row</span>
        <span className="ev-body">
          {fig.channel} · {fig.metric}: last month {cell(fig.lastMonth)}, this month {cell(fig.thisMonth)},{" "}
          {changeText(fig)}
        </span>
      </li>
    );
  }
  const note = noteById.get(item.id);
  if (!note) return null;
  return (
    <li>
      <span className="ev-kind">{SECTION_LABEL[note.section]}</span>
      <span className="ev-body">
        {note.scope ? `${note.scope}: ` : "Whole account: "}“{note.text}”
      </span>
    </li>
  );
}

function SentenceEditor({
  initial,
  allowed,
  quoteSource,
  onSave,
  onCancel,
}: {
  initial: string;
  allowed: Set<string>;
  quoteSource: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const problems = sentenceProblems(value, allowed, quoteSource);
  return (
    <div className="ev-edit">
      <label htmlFor="edit-line">Edit this line</label>
      <textarea id="edit-line" className="editor" value={value} onChange={(event) => setValue(event.target.value)} autoFocus />
      {problems.length ? (
        <ul className="problems" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : (
        <p className="help">Numbers must come from the sheet. Quote any other fact from the context pack.</p>
      )}
      <div className="ev-actions">
        <button type="button" className="primary" disabled={problems.length > 0} onClick={() => onSave(value)}>
          Save line
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
