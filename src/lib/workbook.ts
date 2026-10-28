// The Excel download: every sheet tab as a formatted worksheet. The writer loads only when asked for.
import type { Cell, HeaderCell, SheetTab } from "./sheet";

const HEAD_FILL = "#F1EFEA";
const HEAD_LINE = "#D6D2CA";

type XCell = Record<string, unknown> | null;

function headerCell(h: NonNullable<HeaderCell>, center: boolean): XCell {
  return {
    value: h.label,
    type: String,
    fontWeight: "bold",
    backgroundColor: HEAD_FILL,
    align: center ? "center" : "left",
    alignVertical: "center",
    wrap: true,
    bottomBorderColor: HEAD_LINE,
    bottomBorderStyle: "thin",
    ...(h.span && h.span > 1 ? { columnSpan: h.span } : {}),
    ...(h.rowSpan && h.rowSpan > 1 ? { rowSpan: h.rowSpan } : {}),
  };
}

function valueCell(c: Cell, footer = false): XCell {
  const total = footer ? { fontWeight: "bold", topBorderColor: "#1A1917", topBorderStyle: "thin" } : {};
  if (c.v === null || c.v === undefined || c.v === "") return Object.keys(total).length ? { value: null, ...total } : null;
  if (c.kind === "link" && c.href)
    return {
      value: `HYPERLINK("${c.href.replace(/"/g, "%22")}","${String(c.v).replace(/"/g, "'")}")`,
      type: "Formula",
      textColor: "#1155CC",
      ...total,
    };
  if (typeof c.v === "number") {
    const format = c.kind === "metric" ? "0.0000" : c.kind === "score" ? "0.00" : Number.isInteger(c.v) ? "0" : "0.0";
    return { value: c.v, type: Number, format, ...total };
  }
  return { value: String(c.v), type: String, alignVertical: "top", ...(c.kind === "longtext" ? { wrap: true } : {}), ...total };
}

function worksheet(tab: SheetTab, title: string) {
  const data: XCell[][] = [];
  let sticky = 0;
  if (tab.key === "summary") {
    data.push([{ value: title, type: String, fontWeight: "bold", fontSize: 14 }], []);
    for (const [k, v] of tab.meta) data.push([{ value: k, type: String, fontWeight: "bold" }, { value: v, type: String }]);
    data.push([]);
    sticky = data.length;
  }
  for (const row of tab.header) data.push(row.map((h) => (h ? headerCell(h, (h.span ?? 1) > 1) : null)));
  sticky += tab.header.length;
  for (const row of tab.rows) data.push(row.map((c) => valueCell(c)));
  for (const row of tab.footer) data.push(row.map((c) => valueCell(c, true)));
  return {
    data,
    sheet: tab.name,
    columns: tab.columns.map((c) => ({ width: c.width })),
    stickyRowsCount: sticky,
    stickyColumnsCount: tab.frozenColumns,
  };
}

export async function buildWorkbook(tabs: SheetTab[], title: string): Promise<Blob> {
  const { default: writeXlsxFile } = await import("write-excel-file/universal");
  // The writer's cell types are stricter than the plain objects built above; the shapes match its documented format.
  const sheets = tabs.map((t) => worksheet(t, title)) as unknown as Parameters<typeof writeXlsxFile>[0];
  return writeXlsxFile(sheets as never, { fontFamily: "Arial", fontSize: 10 } as never).toBlob();
}
