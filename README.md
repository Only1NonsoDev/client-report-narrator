**Live preview:** https://client-report-narrator-only1nonsodev.vercel.app (shows whatever is deployed from `main`)

# Client Report Narrator v2

An account manager preparing a monthly client review needs more than "spend went up 10%". They need what changed, why, and what to do next, with the reason traceable to something real.

You give the page two things:

1. **Metrics**: a CSV of this month against last month.
2. **Context pack**: your campaign change log, seasonality and events, site and SEO notes, and client goals. One note per line.

It drafts a monthly strategic review:

1. **Snapshot**: every row, this month against last, numbers only from the sheet.
2. **What moved**: the four biggest percent changes.
3. **Why**: each driver tagged `campaign`, `seasonality`, `site`, `client note`, or `unknown`, and quoted from your notes.
4. **What's next**: three actions, each tied to a line above.
5. **Evidence**: select any line to see the sheet row and the note behind it.
6. **Edit and approve**: edit any line, approve, then copy or download markdown.

It is a portfolio demo. It does not email anyone and does not connect to ad platforms.

## Try it

```bash
node -v        # needs v20 or higher
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and tap **Try sample**. The sample is a made-up hotel client, Northline Hotels, with two markets (Edinburgh, Manchester), a generic and a brand campaign in each, and spend, bookings, ROAS and CPA. The notes include a paused ad group, a budget shift, a new responsive search ad, a half-term demand peak, a landing page launch, and a booking-engine outage.

Layout: on a laptop the sheet, notes and review sit side by side. On a phone they stack. Same address for both. To open it on a phone on the same Wi-Fi: `npm run dev -- --hostname 0.0.0.0`.

## The guardrails

- **No number that is not on the sheet.** Sentences contain only sheet values, the change between the two months, and the percent (change divided by last month, one decimal). If a cell is blank, the review says it is missing. If last month is 0, it says the percent is missing.
- **No reason that is not in the context pack.** A reason is always a verbatim quote of one of your notes, in curly quotes. If no note covers a move, the line is tagged `unknown` and says what to check. Numbers inside a quote (such as dates) are your own words, so they are checked against your notes, not the sheet.
- **Missing context is shown.** With no campaign notes the page says **Add campaign notes to unlock why**, and each why line is `unknown`. Empty seasonality, site and goals sections get a prompt too.
- **Edits are checked.** If you edit a line and add a number that is not on the sheet, or a quote that is not in your notes, the line cannot be saved and the review cannot be approved.

There is no AI model in v2. The review is written by fixed rules, so the same inputs always give the same review. (v1 had an optional OpenAI rewrite; it was removed because a rewrite could not keep the per-sentence evidence honest.)

## Writing the context pack

One note per line in the section it belongs to. To tie a note to certain rows, start the line with a channel name and a colon. The match ignores case and dashes and works on part of a name:

```
Edinburgh - Generic: Paused the broad-match ad group on 8 Oct
Manchester: Moved weekly budget from Brand to Generic on 14 Oct
all: Client priority this quarter is Manchester bookings
```

- `Edinburgh - Generic` reaches only that channel. `Manchester` reaches every Manchester channel. `all:` or no prefix reaches the whole account.
- A short label that matches no channel (for example a typo) is flagged and not used as a reason.
- Each move shows up to three notes, channel-specific notes first.
- Limits: 25 lines per section, 240 characters per line.

## Metrics CSV

```csv
channel,metric,last_month,this_month
Edinburgh - Generic,Spend,6200,4900
```

`channel` can be a market or a campaign. `campaign`, `kpi`, `previous`, and `current` are accepted as other column names. Leave a cell blank when you do not have the number. Up to 40 rows.

## Check it

```bash
npm test         # guardrail and logic tests
npm run typecheck
npm run build
```

## Project layout

- `lib/review.ts` builds the review: movers, sourced drivers, actions.
- `lib/context.ts` reads the context pack and matches notes to rows.
- `lib/ground.ts` number and quote checks, used for both drafting and edits.
- `lib/markdown.ts` the export.
- `lib/sample.ts` the Northline Hotels sample.
- `app/api/report/route.ts` the JSON endpoint behind the page.
- `components/studio.tsx` the inputs, `components/report-view.tsx` the review, evidence, edit and approve.
- `lib/review.test.ts` tests.
