import assert from "node:assert/strict";
import test from "node:test";

import { previewSheet, SheetError } from "./csv";
import { inventedNumbers, percentPoints } from "./ground";
import { modelReportProblem, parseModelReport, resolveReport } from "./model";
import { narrateLocal } from "./narrate";
import { SAMPLE_CLIENT, SAMPLE_CSV, SAMPLE_PERIOD } from "./sample";

test("no invented numbers in the sample report", () => {
  const report = narrateLocal(SAMPLE_CSV, SAMPLE_CLIENT, SAMPLE_PERIOD);

  assert.deepEqual(inventedNumbers(report.text, report.allowed), []);
  assert.ok(inventedNumbers(`${report.text}\n99`, report.allowed).includes("99"));

  assert.match(report.text, /Northline Studio/);
  assert.match(report.text, /September compared with August/);
  assert.match(report.whatChanged, /spend moved from 3800 last month to 4200 this month, up 400, which is 10\.5%/);
  assert.match(report.whatChanged, /clicks moved from 1720 last month to 1860 this month, up 140, which is 8\.1%/);
  assert.match(report.whatChanged, /leads moved from 51 last month to 64 this month, up 13, which is 25\.5%/);
  assert.match(report.whatChanged, /sends moved from 11800 last month to 12400 this month, up 600, which is 5\.1%/);
  assert.match(report.whatChanged, /opens moved from 2950 last month to 3100 this month, up 150, which is 5\.1%/);
  assert.match(report.whatChanged, /leads moved from 79 last month to 88 this month, up 9, which is 11\.4%/);
  assert.match(report.whatChanged, /clicks moved from 980 last month to 910 this month, down 70, which is 7\.1%/);
  assert.match(report.whatChanged, /leads moved from 19 last month to 22 this month, up 3, which is 15\.8%/);

  const impressions = report.whatChanged.split("\n").find((line) => /impressions/i.test(line));
  assert.ok(impressions);
  assert.match(impressions, /45200/);
  assert.match(impressions, /Last month is missing, so the change is missing/);
  assert.doesNotMatch(impressions, /%/);

  assert.match(report.whyItMatters, /Paid search leads rose the most on this sheet, from 51 to 64 \(25\.5%\)/);
  assert.match(report.whyItMatters, /Organic social clicks fell the most on this sheet, from 980 to 910 \(7\.1%\)/);
  assert.match(report.whyItMatters, /Organic social impressions cannot be compared\. Last month is missing\. This month is 45200/);
  assert.match(report.nextActions, /Tell the client about Paid search leads: 51 last month and 64 this month/);
  assert.match(report.nextActions, /Review Organic social clicks before the next plan: 980 last month and 910 this month/);
  assert.match(report.nextActions, /Ask the client for Organic social impressions for last month\. That figure is missing/);
  assert.match(report.audit, /Paid search · Spend — last month 3800, this month 4200, change up 400, 10\.5%/);
  assert.match(report.audit, /Organic social · Impressions — last month missing, this month 45200, change missing/);

  assert.equal(report.figures.find((fig) => fig.metric === "Spend")?.percentPoints, 10.5);
  assert.equal(report.figures.find((fig) => fig.metric === "Spend")?.change, 400);
  assert.equal(
    report.figures.find((fig) => fig.channel === "Organic social" && fig.metric === "Clicks")?.percentPoints,
    -7.1,
  );
  assert.equal(report.figures.find((fig) => fig.metric === "Impressions")?.change, null);

  assert.doesNotMatch(report.text, /chatgpt|benchmark|industry average|significant|NaN|Infinity|undefined/i);
  assert.doesNotMatch(report.text, /cost per lead/i);

  const again = narrateLocal(SAMPLE_CSV, SAMPLE_CLIENT, SAMPLE_PERIOD);
  assert.equal(again.text, report.text);
});

test("percent change is one decimal taken from the two months", () => {
  assert.equal(percentPoints(3800, 4200), 10.5);
  assert.equal(percentPoints(1720, 1860), 8.1);
  assert.equal(percentPoints(51, 64), 25.5);
  assert.equal(percentPoints(11800, 12400), 5.1);
  assert.equal(percentPoints(79, 88), 11.4);
  assert.equal(percentPoints(980, 910), -7.1);
  assert.equal(percentPoints(19, 22), 15.8);
  assert.equal(percentPoints(0, 10), null);
});

test("a missing figure is called missing and is not filled in", () => {
  const report = narrateLocal(
    "channel,metric,last_month,this_month\nEmail,Opens,,80\nEmail,Clicks,12,\nOrganic social,Saves,,\n",
    "",
    "",
  );
  assert.equal(report.clientLine, "Client name is missing.");
  assert.equal(report.periodLine, "Period label is missing.");
  assert.match(report.text, /opens this month is 80\. Last month is missing, so the change is missing/);
  assert.match(report.text, /clicks last month was 12\. This month is missing, so the change is missing/);
  assert.match(report.text, /saves: this month is missing and last month is missing, so the change is missing/);
  assert.match(report.whyItMatters, /No row has both months filled in/);
  assert.doesNotMatch(report.whatChanged, /%/);
  assert.deepEqual(inventedNumbers(report.text, report.allowed), []);
});

test("last month of 0 does not invent a percent", () => {
  const report = narrateLocal("channel,metric,last_month,this_month\nPaid search,Leads,0,8\n", "Northline Studio", "");
  assert.match(report.text, /percent change is missing because last month is 0/);
  assert.match(report.text, /from 0 last month to 8 this month, up 8/);
  assert.doesNotMatch(report.text, /rose the most/);
  assert.doesNotMatch(report.text, /%/);
  assert.doesNotMatch(report.text, /Infinity/);
  assert.deepEqual(inventedNumbers(report.text, report.allowed), []);
});

test("a flat metric stays on the sheet numbers", () => {
  const report = narrateLocal("channel,metric,last_month,this_month\nEmail,Sends,100,100\n", "Northline Studio", "September compared with August");
  assert.match(report.whatChanged, /sends stayed at 100\. The change is 0 \(0\.0%\)/);
  assert.match(report.whyItMatters, /No metric on this sheet rose/);
  assert.match(report.whyItMatters, /No metric on this sheet fell/);
  assert.match(report.nextActions, /Nothing on this sheet rose, fell, or is missing/);
  assert.deepEqual(inventedNumbers(report.text, report.allowed), []);
});

test("opposite spend and leads do not invent cost per lead", () => {
  const report = narrateLocal(
    "channel,metric,last_month,this_month\nPaid search,Spend,1000,1200\nPaid search,Leads,40,30\n",
    "Northline Studio",
    "September compared with August",
  );
  assert.match(report.text, /Cost per lead is missing from the sheet/);
  assert.doesNotMatch(report.text, /per lead is \d/i);
  assert.match(report.whatChanged, /up 200, which is 20\.0%/);
  assert.match(report.whatChanged, /down 10, which is 25\.0%/);
  assert.deepEqual(inventedNumbers(report.text, report.allowed), []);
});

test("numbers in the client name and channel are allowed only because they were typed", () => {
  const report = narrateLocal(
    "channel,metric,last_month,this_month\nTeam 2,Spend,5,6\n",
    "Studio 4",
    "Week 12",
  );
  assert.match(report.text, /Studio 4/);
  assert.match(report.text, /Week 12/);
  assert.match(report.text, /Team 2/);
  assert.deepEqual(inventedNumbers(report.text, report.allowed), []);
});

test("currency commas stay one number", () => {
  const report = narrateLocal(
    'channel,metric,last_month,this_month\nPaid search,Spend,"$3,800","$4,200"\n',
    "Northline Studio",
    "September compared with August",
  );
  assert.match(report.whatChanged, /from 3800 last month to 4200 this month, up 400, which is 10\.5%/);
  assert.doesNotMatch(report.text, /\$/);
  assert.deepEqual(inventedNumbers(report.text, report.allowed), []);
});

test("quoted channel names and header aliases parse", () => {
  const quoted = narrateLocal(
    'channel,metric,last_month,this_month\n"Paid search, brand",Spend,10,12\n',
    "Northline Studio",
    "September compared with August",
  );
  assert.match(quoted.whatChanged, /Paid search, brand/);
  assert.match(quoted.whatChanged, /up 2, which is 20\.0%/);
  assert.deepEqual(inventedNumbers(quoted.text, quoted.allowed), []);

  const aliased = narrateLocal("Campaign,KPI,Previous,Current\nEmail,Sends,10,12\n", "Northline Studio", "September compared with August");
  assert.match(aliased.whatChanged, /Email/);
  assert.match(aliased.whatChanged, /from 10 last month to 12 this month/);
  assert.deepEqual(inventedNumbers(aliased.text, aliased.allowed), []);
});

test("a sheet preview lists rows and channels from the sample", () => {
  const preview = previewSheet(SAMPLE_CSV);
  const last = preview.rows[preview.rows.length - 1];
  assert.equal(preview.rowCount, 9);
  assert.deepEqual(preview.channels, ["Paid search", "Email", "Organic social"]);
  assert.equal(last?.metric, "Impressions");
  assert.equal(last?.lastMonth, null);
  assert.equal(last?.thisMonth, 45200);
});

test("bad sheets are rejected in plain language", () => {
  assert.throws(() => narrateLocal("", "Northline Studio", "September compared with August"), SheetError);
  assert.throws(
    () => narrateLocal("foo,bar\n1,2\n", "Northline Studio", "September compared with August"),
    /channel, metric, last_month, and this_month/,
  );
  assert.throws(
    () => narrateLocal("channel,metric,last_month,this_month\nEmail,Opens,10,soon\n", "Northline Studio", "September compared with August"),
    /not a number/,
  );
});

test("model output with a new number falls back to the local report", () => {
  const local = narrateLocal(SAMPLE_CSV, SAMPLE_CLIENT, SAMPLE_PERIOD);
  const invented = {
    whatChanged: "Leads jumped by 99 percent.",
    whyItMatters: "Reach is now excellent.",
    nextActions: "Increase the budget.",
  };
  assert.match(modelReportProblem(invented, local.allowed, local.figures) ?? "", /number that is not in the source/);
  const resolved = resolveReport(local, invented, null);
  assert.equal(resolved.mode, "demo");
  assert.equal(resolved.whatChanged, local.whatChanged);
  assert.equal(resolved.whyItMatters, local.whyItMatters);
  assert.equal(resolved.nextActions, local.nextActions);
  assert.match(resolved.notice ?? "", /local rewrite/);
  assert.deepEqual(inventedNumbers(`${resolved.whatChanged}\n${resolved.whyItMatters}\n${resolved.nextActions}`, local.allowed), []);
});

test("model output that skips a missing figure falls back", () => {
  const local = narrateLocal(SAMPLE_CSV, SAMPLE_CLIENT, SAMPLE_PERIOD);
  const skipped = {
    whatChanged: "Paid search spend moved from 3800 last month to 4200 this month, up 400, which is 10.5%.",
    whyItMatters: "Paid search leads rose from 51 to 64.",
    nextActions: "Tell the client about paid search leads: 51 last month and 64 this month.",
  };
  assert.match(modelReportProblem(skipped, local.allowed, local.figures) ?? "", /skipped a missing figure/);
  const resolved = resolveReport(local, skipped, null);
  assert.equal(resolved.mode, "demo");
  assert.match(resolved.whatChanged, /missing/);
});

test("model output that stays on the sheet numbers is kept", () => {
  const local = narrateLocal(SAMPLE_CSV, SAMPLE_CLIENT, SAMPLE_PERIOD);
  const clean = {
    whatChanged: local.whatChanged,
    whyItMatters: local.whyItMatters,
    nextActions: local.nextActions,
  };
  assert.equal(modelReportProblem(clean, local.allowed, local.figures), null);
  const resolved = resolveReport(local, clean, null);
  assert.equal(resolved.mode, "model");
  assert.equal(resolved.notice, null);
  assert.equal(resolved.whatChanged, local.whatChanged);
});

test("model JSON can be read from a fenced string", () => {
  const parsed = parseModelReport('```json\n{"whatChanged":"A","whyItMatters":"B","nextActions":"C"}\n```');
  assert.deepEqual(parsed, { whatChanged: "A", whyItMatters: "B", nextActions: "C" });
  assert.equal(parseModelReport({ whatChanged: "  ", whyItMatters: "B", nextActions: "C" }), null);
});
