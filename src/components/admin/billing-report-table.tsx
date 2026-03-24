"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import type {
  BillingReportResponse,
  BillingReportMultiTenantRow,
  BillingReportSingleTenantRow,
} from "@/lib/types";

interface BillingReportTableProps {
  report: BillingReportResponse;
  includePrices: boolean;
}

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

export function BillingReportTable({ report, includePrices }: BillingReportTableProps) {
  const isMulti = report.mode === "multi-tenant";
  const { totals, monthCount } = report;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{isMulti ? "Mandant" : "Datum"}</TableHead>
            <TableHead className="text-right">Bestellungen</TableHead>
            <TableHead className="text-right">Bestellpositionen</TableHead>
            {includePrices && isMulti && (
              <>
                <TableHead className="text-right">Preis pro Bestellung</TableHead>
                <TableHead className="text-right">Bestellungen &times; Preis</TableHead>
                <TableHead className="text-right">
                  Monatliche Grundgebuehr
                  {monthCount > 1 && (
                    <span className="ml-1 text-xs text-muted-foreground font-normal">
                      (&times;{monthCount} Mon.)
                    </span>
                  )}
                </TableHead>
              </>
            )}
            {includePrices && !isMulti && (
              <>
                <TableHead className="text-right">Preis pro Bestellung</TableHead>
                <TableHead className="text-right">Bestellungen &times; Preis</TableHead>
                <TableHead className="text-right">
                  Monatliche Grundgebuehr
                  {monthCount > 1 && (
                    <span className="ml-1 text-xs text-muted-foreground font-normal">
                      (&times;{monthCount} Mon.)
                    </span>
                  )}
                </TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>

        <TableBody>
          {report.rows.map((row, idx) => {
            if (isMulti) {
              const r = row as BillingReportMultiTenantRow;
              return (
                <TableRow key={r.tenantId}>
                  <TableCell className="font-medium">{r.tenantName}</TableCell>
                  <TableCell className="text-right">{r.orderCount}</TableCell>
                  <TableCell className="text-right">{r.lineItemCount}</TableCell>
                  {includePrices && (
                    <>
                      <TableCell className="text-right">
                        {formatCurrency(r.costPerOrder)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(r.transactionTotal)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(r.monthlyFee)}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              );
            } else {
              const r = row as BillingReportSingleTenantRow;
              return (
                <TableRow key={r.date ?? idx}>
                  <TableCell className="font-medium">{formatDateDE(r.date)}</TableCell>
                  <TableCell className="text-right">{r.orderCount}</TableCell>
                  <TableCell className="text-right">{r.lineItemCount}</TableCell>
                  {includePrices && (
                    <>
                      <TableCell className="text-right">{"\u2014"}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(r.transactionTotal)}
                      </TableCell>
                      <TableCell className="text-right">{"\u2014"}</TableCell>
                    </>
                  )}
                </TableRow>
              );
            }
          })}
        </TableBody>

        <TableFooter>
          <TableRow className="font-bold">
            <TableCell>Gesamt</TableCell>
            <TableCell className="text-right">{totals.orderCount}</TableCell>
            <TableCell className="text-right">{totals.lineItemCount}</TableCell>
            {includePrices && isMulti && (
              <>
                <TableCell className="text-right" />
                <TableCell className="text-right">
                  {formatCurrency(totals.transactionTotal)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(totals.monthlyFeeTotal)}
                </TableCell>
              </>
            )}
            {includePrices && !isMulti && (
              <>
                <TableCell className="text-right">
                  {formatCurrency(totals.costPerOrder ?? null)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(totals.transactionTotal)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(totals.monthlyFeeTotal)}
                </TableCell>
              </>
            )}
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
