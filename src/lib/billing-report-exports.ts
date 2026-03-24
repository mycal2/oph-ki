import type {
  BillingReportResponse,
  BillingReportMultiTenantRow,
  BillingReportSingleTenantRow,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function formatDateDE(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}.${month}.${year}`;
}

function formatCurrency(value: number | null): string {
  if (value === null) return "\u2014";
  return value.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });
}

interface ExportMeta {
  title: string;
  dateRange: string;
  tenants: string;
  generated: string;
}

function buildMeta(
  report: BillingReportResponse,
  tenantNames: string[]
): ExportMeta {
  return {
    title: "Abrechnungsbericht",
    dateRange: `${formatDateDE(report.from)} \u2013 ${formatDateDE(report.to)}`,
    tenants:
      tenantNames.length > 5
        ? `${tenantNames.length} Mandanten`
        : tenantNames.join(", "),
    generated: new Date().toLocaleString("de-DE"),
  };
}

function getHeaders(
  report: BillingReportResponse,
  includePrices: boolean
): string[] {
  const base =
    report.mode === "multi-tenant"
      ? ["Mandant", "Bestellungen", "Bestellpositionen"]
      : ["Datum", "Bestellungen", "Bestellpositionen"];

  if (includePrices) {
    if (report.mode === "multi-tenant") {
      base.push("Preis pro Bestellung", "Bestellungen \u00D7 Preis", "Monatliche Grundgebuehr");
    } else {
      base.push("Preis pro Bestellung", "Bestellungen \u00D7 Preis", "Monatliche Grundgebuehr");
    }
  }

  return base;
}

function getRowData(
  row: BillingReportMultiTenantRow | BillingReportSingleTenantRow,
  report: BillingReportResponse,
  includePrices: boolean
): string[] {
  if (report.mode === "multi-tenant") {
    const r = row as BillingReportMultiTenantRow;
    const base = [r.tenantName, String(r.orderCount), String(r.lineItemCount)];
    if (includePrices) {
      base.push(
        formatCurrency(r.costPerOrder),
        formatCurrency(r.transactionTotal),
        formatCurrency(r.monthlyFee)
      );
    }
    return base;
  } else {
    const r = row as BillingReportSingleTenantRow;
    const base = [formatDateDE(r.date), String(r.orderCount), String(r.lineItemCount)];
    if (includePrices) {
      base.push(
        "\u2014", // no cost per order on individual days
        formatCurrency(r.transactionTotal),
        "\u2014"  // no monthly fee on individual days
      );
    }
    return base;
  }
}

function getTotalsRow(
  report: BillingReportResponse,
  includePrices: boolean
): string[] {
  const t = report.totals;
  const base = ["Gesamt", String(t.orderCount), String(t.lineItemCount)];

  if (includePrices) {
    if (report.mode === "multi-tenant") {
      base.push(
        "", // no cost per order in totals
        formatCurrency(t.transactionTotal),
        formatCurrency(t.monthlyFeeTotal)
      );
    } else {
      base.push(
        formatCurrency(t.costPerOrder ?? null),
        formatCurrency(t.transactionTotal),
        formatCurrency(t.monthlyFeeTotal)
      );
    }
  }

  return base;
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportCsv(
  report: BillingReportResponse,
  includePrices: boolean,
  tenantNames: string[]
): void {
  const meta = buildMeta(report, tenantNames);
  const headers = getHeaders(report, includePrices);

  const lines: string[] = [
    meta.title,
    `Zeitraum: ${meta.dateRange}`,
    `Mandanten: ${meta.tenants}`,
    `Erstellt: ${meta.generated}`,
    "",
    headers.map(escapeCsv).join(","),
  ];

  for (const row of report.rows) {
    lines.push(getRowData(row, report, includePrices).map(escapeCsv).join(","));
  }

  lines.push(getTotalsRow(report, includePrices).map(escapeCsv).join(","));

  const blob = new Blob(["\uFEFF" + lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  downloadBlob(blob, `abrechnungsbericht-${report.from}-${report.to}.csv`);
}

// ---------------------------------------------------------------------------
// XLS Export
// ---------------------------------------------------------------------------

export async function exportXls(
  report: BillingReportResponse,
  includePrices: boolean,
  tenantNames: string[]
): Promise<void> {
  const XLSX = await import("xlsx");
  const meta = buildMeta(report, tenantNames);
  const headers = getHeaders(report, includePrices);

  const wsData: (string | number)[][] = [
    [meta.title],
    [`Zeitraum: ${meta.dateRange}`],
    [`Mandanten: ${meta.tenants}`],
    [`Erstellt: ${meta.generated}`],
    [],
    headers,
  ];

  for (const row of report.rows) {
    wsData.push(getRowData(row, report, includePrices));
  }

  wsData.push(getTotalsRow(report, includePrices));

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Abrechnungsbericht");
  XLSX.writeFile(wb, `abrechnungsbericht-${report.from}-${report.to}.xlsx`);
}

// ---------------------------------------------------------------------------
// PDF Export
// ---------------------------------------------------------------------------

export async function exportPdf(
  report: BillingReportResponse,
  includePrices: boolean,
  tenantNames: string[]
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;

  const meta = buildMeta(report, tenantNames);
  const headers = getHeaders(report, includePrices);

  // Use landscape for wide tables
  const isWide = includePrices && report.mode === "multi-tenant";
  const doc = new jsPDF({ orientation: isWide ? "landscape" : "portrait" });

  // Title and meta
  doc.setFontSize(16);
  doc.text(meta.title, 14, 20);
  doc.setFontSize(10);
  doc.text(`Zeitraum: ${meta.dateRange}`, 14, 28);
  doc.text(`Mandanten: ${meta.tenants}`, 14, 34);
  doc.text(`Erstellt: ${meta.generated}`, 14, 40);

  // Table body
  const body: string[][] = [];
  for (const row of report.rows) {
    body.push(getRowData(row, report, includePrices));
  }

  // Totals row
  const totals = getTotalsRow(report, includePrices);

  autoTable(doc, {
    startY: 48,
    head: [headers],
    body: [...body, totals],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [50, 50, 50] },
    // Bold the last (totals) row
    didParseCell(data: { row: { index: number }; cell: { styles: { fontStyle: string } } }) {
      if (data.row.index === body.length) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  doc.save(`abrechnungsbericht-${report.from}-${report.to}.pdf`);
}

// ---------------------------------------------------------------------------
// Blob download helper
// ---------------------------------------------------------------------------

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
