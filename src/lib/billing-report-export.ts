"use client";

/**
 * OPH-54: Client-side export utilities for the billing report.
 * Generates CSV, XLSX, and PDF downloads from the table data already in the browser.
 */

import type {
  BillingReportResponse,
  BillingReportMultiTenantRow,
  BillingReportSingleTenantRow,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Format a number as EUR currency string (e.g. "1.234,56 EUR"). */
function formatEur(value: number | null): string {
  if (value === null) return "\u2014";
  return (
    value.toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " \u20AC"
  );
}

/** Format a date string (YYYY-MM-DD) to German locale (DD.MM.YYYY). */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Build the header metadata lines for exports. */
function buildHeaderLines(
  report: BillingReportResponse,
  tenantNames: string[]
): string[] {
  const lines: string[] = [];
  lines.push("Abrechnungsbericht");
  lines.push(
    `Zeitraum: ${formatDate(report.from)} - ${formatDate(report.to)} (${report.monthCount} ${report.monthCount === 1 ? "Monat" : "Monate"})`
  );
  if (tenantNames.length <= 5) {
    lines.push(`Mandanten: ${tenantNames.join(", ")}`);
  } else {
    lines.push(`Mandanten: ${tenantNames.length} ausgewaehlt`);
  }
  lines.push(
    `Erstellt am: ${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
  );
  return lines;
}

/** Determine column headers based on mode and whether prices are included. */
function getColumnHeaders(
  report: BillingReportResponse,
  includePrices: boolean
): string[] {
  const isMulti = report.mode === "multi-tenant";
  const headers = [
    isMulti ? "Mandant" : "Datum",
    "Bestellungen",
    "Bestellpositionen",
  ];
  if (includePrices) {
    if (isMulti) {
      headers.push("Preis/Bestellung", "Bestellungen x Preis", "Grundgebuehr");
    } else {
      headers.push("Preis/Bestellung", "Bestellungen x Preis", "Grundgebuehr");
    }
  }
  return headers;
}

/** Build rows as string arrays for export. */
function buildExportRows(
  report: BillingReportResponse,
  includePrices: boolean
): string[][] {
  const isMulti = report.mode === "multi-tenant";
  const dataRows: string[][] = [];

  if (isMulti) {
    for (const row of report.rows as BillingReportMultiTenantRow[]) {
      const r = [
        row.tenantName,
        String(row.orderCount),
        String(row.lineItemCount),
      ];
      if (includePrices) {
        r.push(
          formatEur(row.costPerOrder),
          formatEur(row.transactionTotal),
          formatEur(row.monthlyFee)
        );
      }
      dataRows.push(r);
    }
  } else {
    for (const row of report.rows as BillingReportSingleTenantRow[]) {
      const r = [
        formatDate(row.date),
        String(row.orderCount),
        String(row.lineItemCount),
      ];
      if (includePrices) {
        r.push(
          "\u2014", // no cost per order on individual days
          formatEur(row.transactionTotal),
          "\u2014"  // no monthly fee on individual days
        );
      }
      dataRows.push(r);
    }
  }

  // Totals row
  const totals = report.totals;
  const totalsRow = [
    "Gesamt",
    String(totals.orderCount),
    String(totals.lineItemCount),
  ];
  if (includePrices) {
    if (isMulti) {
      totalsRow.push(
        "", // no cost per order in totals
        formatEur(totals.transactionTotal),
        formatEur(totals.monthlyFeeTotal)
      );
    } else {
      totalsRow.push(
        formatEur(totals.costPerOrder ?? null),
        formatEur(totals.transactionTotal),
        formatEur(totals.monthlyFeeTotal)
      );
    }
  }
  dataRows.push(totalsRow);

  return dataRows;
}

/** Get tenant names from the report rows (multi-tenant mode). */
function getTenantNames(report: BillingReportResponse): string[] {
  if (report.mode === "multi-tenant") {
    return (report.rows as BillingReportMultiTenantRow[]).map((r) => r.tenantName);
  }
  return [];
}

/** Trigger a file download in the browser. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Generate a filename base from the report. */
function filenameBase(report: BillingReportResponse): string {
  return `abrechnungsbericht_${report.from}_${report.to}`;
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

/**
 * Export the billing report as a CSV file.
 * Plain string building — no library needed.
 */
export function exportBillingReportCsv(
  report: BillingReportResponse,
  includePrices: boolean,
  tenantNames: string[]
): void {
  const headerLines = buildHeaderLines(report, tenantNames);
  const columns = getColumnHeaders(report, includePrices);
  const rows = buildExportRows(report, includePrices);

  // Escape CSV values
  const esc = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const csvParts: string[] = [];

  // Header metadata as comment-like rows
  for (const line of headerLines) {
    csvParts.push(esc(line));
  }
  csvParts.push(""); // blank line

  // Column headers
  csvParts.push(columns.map(esc).join(";"));

  // Data rows
  for (const row of rows) {
    csvParts.push(row.map(esc).join(";"));
  }

  const csvString = csvParts.join("\n");
  // BOM for Excel compatibility
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvString], {
    type: "text/csv;charset=utf-8;",
  });
  downloadBlob(blob, `${filenameBase(report)}.csv`);
}

// ---------------------------------------------------------------------------
// XLS (XLSX) Export
// ---------------------------------------------------------------------------

/**
 * Export the billing report as an XLSX file.
 * Uses the `xlsx` library (SheetJS) already installed.
 */
export async function exportBillingReportXlsx(
  report: BillingReportResponse,
  includePrices: boolean,
  tenantNames: string[]
): Promise<void> {
  // Dynamic import to keep initial bundle small
  const XLSX = await import("xlsx");

  const headerLines = buildHeaderLines(report, tenantNames);
  const columns = getColumnHeaders(report, includePrices);
  const rows = buildExportRows(report, includePrices);

  // Build worksheet data: header lines + blank row + column headers + data rows
  const wsData: string[][] = [];
  for (const line of headerLines) {
    wsData.push([line]);
  }
  wsData.push([]); // blank row
  wsData.push(columns);
  for (const row of rows) {
    wsData.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  const colWidths = columns.map((_, i) => {
    const maxLen = Math.max(
      columns[i].length,
      ...rows.map((r) => (r[i] ?? "").length)
    );
    return { wch: Math.min(Math.max(maxLen + 2, 12), 40) };
  });
  ws["!cols"] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Abrechnungsbericht");

  const xlsxBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([xlsxBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `${filenameBase(report)}.xlsx`);
}

// ---------------------------------------------------------------------------
// PDF Export
// ---------------------------------------------------------------------------

/**
 * Export the billing report as a formatted PDF file.
 * Uses jsPDF + jspdf-autotable for table rendering.
 * Landscape orientation for wide columns.
 */
export async function exportBillingReportPdf(
  report: BillingReportResponse,
  includePrices: boolean,
  tenantNames: string[]
): Promise<void> {
  // Dynamic imports
  const { jsPDF } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  // jspdf-autotable registers itself as a side effect; access via default if available
  const autoTable =
    typeof autoTableModule.default === "function"
      ? autoTableModule.default
      : (autoTableModule as unknown as { default: typeof autoTableModule.default }).default;

  const headerLines = buildHeaderLines(report, tenantNames);
  const columns = getColumnHeaders(report, includePrices);
  const rows = buildExportRows(report, includePrices);

  // Use landscape for wide tables (both multi- and single-tenant with prices have 6 columns)
  const isWide = includePrices;
  const doc = new jsPDF({
    orientation: isWide ? "landscape" : "portrait",
    unit: "mm",
    format: "a4",
  });

  // Header
  let y = 15;
  doc.setFontSize(16);
  doc.text(headerLines[0], 14, y);
  y += 8;

  doc.setFontSize(10);
  for (let i = 1; i < headerLines.length; i++) {
    doc.text(headerLines[i], 14, y);
    y += 5;
  }
  y += 5;

  // Table
  const lastRowIndex = rows.length - 1;

  autoTable(doc, {
    startY: y,
    head: [columns],
    body: rows,
    theme: "grid",
    headStyles: {
      fillColor: [24, 24, 27], // zinc-900
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 9,
    },
    didParseCell: (data: { row: { index: number }; cell: { styles: { fontStyle: string } } }) => {
      // Bold the totals row (last data row)
      if (data.row.index === lastRowIndex) {
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${filenameBase(report)}.pdf`);
}
