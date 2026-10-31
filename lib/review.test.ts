import assert from "node:assert/strict";
import test from "node:test";

import { EMPTY_CONTEXT, parseContext } from "./context";
import { SheetError } from "./csv";
import { inventedNumbers, percentPoints, sentenceProblems, stripQuotes } from "./ground";
import { toMarkdown } from "./markdown";
import { buildReview } from "./review";
import { SAMPLE_CLIENT, SAMPLE_CONTEXT, SAMPLE_CSV, SAMPLE_PERIOD } from "./sample";
import type { Review, Sentence } from "./types";

const sample = () => buildReview(SAMPLE_CSV, SAMPLE_CLIENT, SAMPLE_PERIOD, SAMPLE_CONTEXT);
const sentences = (review: Review): Sentence[] => [...review.moved, ...review.why, ...review.next];

test("sample: no number outside a quoted note is missing from the sheet", () => {
  const review = sample();
  const allowed = new Set(review.allowed);
  for (const sentence of sentences(review)) {
    assert.deepEqual(inventedNumbers(stripQuotes(sentence.text), allowed), [], sentence.text);
    assert.deepEqual(sentenceProblems(sentence.text, allowed, review.quoteSource), [], sentence.text);
  }
  assert.ok(inventedNumbers("99", allowed).includes("99"));
});

test("sample: top movers are ranked by percent change, with sheet numbers", () => {
  const review = sample();
  assert.deepEqual(
    review.moved.map((sentence) => sentence.text),
    [
      "Edinburgh - Brand bookings rose 29.2%, from 96 to 124.",
      "Manchester - Brand spend fell 26.7%, from 1500 to 1100.",
      "Edinburgh - Generic ROAS rose 25.8%, from 3.1 to 3.9.",
      "Manchester - Generic spend rose 25.5%, from 5100 to 6400.",
    ],
  );
});

test("sample: why shows campaign and seasonality, each sourced to a note", () => {
  const review = sample();
  const tags = new Set(review.why.map((sentence) => sentence.tag));
  for (const tag of ["campaign", "seasonality", "site", "client note"] as const) assert.ok(tags.has(tag), tag);
  assert.ok(!tags.has("unknown"));

  const season = review.why.find((sentence) => sentence.tag === "seasonality")!;
  assert.match(season.text, /Edinburgh - Brand bookings \(up 29\.2%\)/);
  assert.match(season.text, /School half-term and Halloween weekend/);

  const paused = review.why.find((sentence) => /Paused the broad-match/.test(sentence.text))!;
  assert.equal(paused.tag, "campaign");
  assert.match(paused.text, /Edinburgh - Generic ROAS/);

  for (const sentence of review.why) {
    assert.ok(sentence.evidence.some((e) => e.kind === "row"), sentence.text);
    assert.ok(sentence.evidence.some((e) => e.kind === "note"), sentence.text);
  }
});

test("sample: a scoped note reaches only the rows it names", () => {
  const review = sample();
  const rsa = review.notes.find((note) => /responsive search ad/.test(note.text))!;
  const reached = review.why.filter((s) => s.evidence.some((e) => e.kind === "note" && e.id === rsa.id));
  assert.ok(reached.length > 0);
  for (const sentence of reached) assert.match(sentence.text, /^Manchester - Generic/);
});

test("sample: exactly three next actions, each tied to a driver", () => {
  const review = sample();
  assert.equal(review.next.length, 3);
  for (const action of review.next) {
    assert.ok(action.tag && action.tag !== "unknown", action.text);
    assert.ok(action.evidence.length >= 2, action.text);
  }
});

test("metrics only: every why is unknown and the sheet asks for notes", () => {
  const review = buildReview(SAMPLE_CSV, SAMPLE_CLIENT, SAMPLE_PERIOD, EMPTY_CONTEXT);
  assert.ok(review.why.length > 0);
  for (const sentence of review.why) {
    assert.equal(sentence.tag, "unknown");
    assert.match(sentence.text, /the reason is unknown\. Check /);
    assert.doesNotMatch(sentence.text, /“/);
  }
  assert.equal(review.prompts.length, 4);
  assert.equal(review.prompts[0].text, "Add campaign notes to unlock why");
  assert.equal(review.next.length, 3);
  assert.ok(review.next.every((action) => action.tag === "unknown"));
});

test("a filled section produces no prompt", () => {
  const review = buildReview(SAMPLE_CSV, SAMPLE_CLIENT, SAMPLE_PERIOD, { ...EMPTY_CONTEXT, campaign: "all: Paused a loser on 8 Oct" });
  assert.deepEqual(
    review.prompts.map((prompt) => prompt.section),
    ["seasonality", "site", "goals"],
  );
});

test("a note for a channel the sheet does not have is flagged and not used as a reason", () => {
  const review = buildReview(SAMPLE_CSV, SAMPLE_CLIENT, SAMPLE_PERIOD, {
    ...EMPTY_CONTEXT,
    campaign: "Glasgow: Paused everything on 1 Oct",
  });
  assert.equal(review.warnings.length, 1);
  assert.match(review.warnings[0], /Glasgow/);
  assert.ok(review.why.every((sentence) => sentence.tag === "unknown"));
  assert.ok(review.why.every((sentence) => !/Glasgow/.test(sentence.text)));
});

test("a colon in ordinary prose does not read as a scope", () => {
  const { notes, warnings } = parseContext(
    { ...EMPTY_CONTEXT, campaign: "12 Oct: new ad copy went live" },
    ["Edinburgh - Generic"],
  );
  assert.deepEqual(warnings, []);
  assert.equal(notes[0].scope, null);
  assert.equal(notes[0].text, "12 Oct: new ad copy went live");
});

test("scopes match across dashes and case", () => {
  const { notes } = parseContext(
    { ...EMPTY_CONTEXT, campaign: "edinburgh generic: Paused a group" },
    ["Edinburgh - Generic", "Manchester - Generic"],
  );
  assert.equal(notes[0].scope, "edinburgh generic");
  assert.equal(notes[0].linked, true);
});

test("quote marks inside a note cannot break out of the quoted span", () => {
  const { notes } = parseContext({ ...EMPTY_CONTEXT, campaign: 'all: Paused "Broad" on 8 Oct' }, ["A"]);
  assert.equal(notes[0].text, "Paused 'Broad' on 8 Oct");
});

test("oversized context is refused", () => {
  assert.throws(() => parseContext({ ...EMPTY_CONTEXT, site: "x".repeat(241) }, ["A"]), SheetError);
  assert.throws(() => parseContext({ ...EMPTY_CONTEXT, site: "a\n".repeat(26) }, ["A"]), SheetError);
});

test("missing figures stay missing and are never filled in", () => {
  const review = buildReview(
    "channel,metric,last_month,this_month\nEmail,Opens,,80\nEmail,Clicks,12,\nSocial,Saves,,\nSocial,Reach,0,10\n",
    "",
    "",
    EMPTY_CONTEXT,
  );
  assert.equal(review.clientLine, "Client name is missing.");
  const text = review.moved.map((s) => s.text).join("\n");
  assert.match(text, /Email opens is 80 this month\. Last month is missing, so the change is missing/);
  assert.match(text, /Email clicks was 12 last month\. This month is missing, so the change is missing/);
  assert.match(text, /Social saves is missing for both months/);
  assert.match(text, /Social reach moved from 0 to 10\. The percent change is missing because last month is 0/);
  assert.doesNotMatch(text, /%/);
  assert.match(review.next.map((s) => s.text).join("\n"), /Ask the client for the missing figures: Email opens; Email clicks; Social saves/);
  assert.doesNotMatch(JSON.stringify(review), /NaN|Infinity|undefined/);
});

test("a flat month says nothing moved", () => {
  const review = buildReview("channel,metric,last_month,this_month\nA,Spend,10,10\n", "A", "P", EMPTY_CONTEXT);
  assert.equal(review.moved[0].text, "Nothing moved: every row with both months is flat.");
  assert.deepEqual(review.why, []);
  assert.equal(review.next.length, 3);
});

test("the same inputs always give the same review", () => {
  assert.deepEqual(sample(), sample());
});

test("an edit that adds a number or a quote the pack lacks is caught", () => {
  const review = sample();
  const allowed = new Set(review.allowed);
  assert.deepEqual(sentenceProblems("Spend rose 29.2%, from 96 to 124.", allowed, review.quoteSource), []);
  assert.deepEqual(sentenceProblems("Spend rose 31% on 8 Oct.", allowed, review.quoteSource), [
    "31 is not a number on the sheet.",
    "8 is not a number on the sheet.",
  ]);
  assert.deepEqual(
    sentenceProblems("The log says “Paused everything”.", allowed, review.quoteSource),
    ['The quote "Paused everything" is not in the context pack.'],
  );
  assert.deepEqual(
    sentenceProblems("The log says “Paused the broad-match ad group on 8 Oct”.", allowed, review.quoteSource),
    [],
  );
});

test("percent change is one decimal taken from the two months", () => {
  assert.equal(percentPoints(96, 124), 29.2);
  assert.equal(percentPoints(1500, 1100), -26.7);
  assert.equal(percentPoints(3.1, 3.9), 25.8);
  assert.equal(percentPoints(5100, 6400), 25.5);
  assert.equal(percentPoints(0, 10), null);
});

test("markdown carries the snapshot, tagged reasons, and edits", () => {
  const review = sample();
  const first = review.moved[0];
  const md = toMarkdown(review, { [first.id]: "Edinburgh - Brand bookings rose 29.2%. Edited by a person." });
  assert.match(md, /^# Monthly review: Northline Hotels/);
  assert.match(md, /\| Edinburgh - Brand \| Bookings \| 96 \| 124 \| \+28 \| 29\.2% \|/);
  assert.match(md, /\| Manchester - Brand \| Spend \| 1500 \| 1100 \| -400 \| -26\.7% \|/);
  assert.match(md, /- Edinburgh - Brand bookings rose 29\.2%\. Edited by a person\./);
  assert.match(md, /- \*\*seasonality\*\*: Edinburgh - Brand bookings/);
  assert.match(md, /\n3\. /);
});

test("a bad sheet still raises a plain error", () => {
  assert.throws(() => buildReview("", "", "", EMPTY_CONTEXT), SheetError);
  assert.throws(() => buildReview("a,b\n1,2", "", "", EMPTY_CONTEXT), SheetError);
});
