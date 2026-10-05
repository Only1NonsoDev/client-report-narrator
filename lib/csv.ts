export class SheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SheetError";
  }
}

export type Row = {
  channel: string;
  metric: string;
  lastMonth: number | null;
  thisMonth: number | null;
};

const CHANNEL = new Set(["channel", "campaign", "source", "name"]);
const METRIC = new Set(["metric", "measure", "kpi", "stat"]);
const LAST = new Set([
  "last month",
  "last_month",
  "previous",
  "previous month",
  "previous_month",
  "prior",
  "prior month",
  "prior_month",
]);
const CURRENT = new Set(["this month", "this_month", "current", "current month", "current_month"]);

const MAX_CHARS = 100_000;
const MAX_ROWS = 40;

export function parseSheet(csv: string): Row[] {
  const source = csv.replace(/^\uFEFF/, "");
  if (!source.trim()) {
    throw new SheetError("Paste a CSV or load the sample first.");
  }
  if (source.length > MAX_CHARS) {
    throw new SheetError("That sheet is too big for this demo. Use one month and a few dozen rows.");
  }

  const grid = parseCsv(source).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (grid.length < 2) {
    throw new SheetError("The sheet needs a header row and at least one data row.");
  }

  const headers = grid[0].map(normHeader);
  const channelAt = headers.findIndex((header) => CHANNEL.has(header));
  const metricAt = headers.findIndex((header) => METRIC.has(header));
  const lastAt = headers.findIndex((header) => LAST.has(normHeader(header).replace(/_/g, " ")) || LAST.has(header));
  const currentAt = headers.findIndex((header) => CURRENT.has(header) || CURRENT.has(header.replace(/_/g, " ")));

  if (channelAt < 0 || metricAt < 0 || lastAt < 0 || currentAt < 0) {
    throw new SheetError(
      "The sheet needs a channel column, a metric column, a last month column, and a this month column. Name them channel, metric, last_month, and this_month.",
    );
  }

  const rows: Row[] = [];
  for (let index = 1; index < grid.length; index += 1) {
    const cells = grid[index];
    const channel = (cells[channelAt] ?? "").trim();
    const metric = (cells[metricAt] ?? "").trim();
    const displayRow = index + 1;
    if (!channel || !metric) {
      throw new SheetError(`Row ${displayRow} needs a channel and a metric.`);
    }
    rows.push({
      channel,
      metric,
      lastMonth: readCell(cells[lastAt] ?? "", displayRow, "last month"),
      thisMonth: readCell(cells[currentAt] ?? "", displayRow, "this month"),
    });
    if (rows.length > MAX_ROWS) {
      throw new SheetError("This demo reads up to 40 rows. Trim the sheet and try again.");
    }
  }

  if (!rows.length) {
    throw new SheetError("The sheet needs a header row and at least one data row.");
  }
  return rows;
}

export type SheetPreview = {
  rowCount: number;
  channels: string[];
  rows: Row[];
};

export function previewSheet(csv: string): SheetPreview {
  const rows = parseSheet(csv);
  const channels: string[] = [];
  for (const row of rows) {
    if (!channels.includes(row.channel)) channels.push(row.channel);
  }
  return { rowCount: rows.length, channels, rows };
}

function normHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function readCell(raw: string, row: number, column: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-" || trimmed === "—" || /^n\/?a$/i.test(trimmed) || /^missing$/i.test(trimmed)) {
    return null;
  }
  const cleaned = trimmed.replace(/[$,\s]/g, "").replace(/%$/, "");
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    throw new SheetError(
      `Row ${row}, ${column}, is "${trimmed}", which is not a number. Leave the cell blank if the figure is missing.`,
    );
  }
  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    throw new SheetError(`Row ${row}, ${column}, is not a usable number. Leave the cell blank if the figure is missing.`);
  }
  return value;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}
