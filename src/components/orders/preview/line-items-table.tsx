import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Package } from "lucide-react";
import type { CanonicalLineItem } from "@/lib/types";

interface LineItemsTableProps {
  lineItems: CanonicalLineItem[];
  totalAmount: number | null;
  currency: string | null;
  /**
   * OPH-109: When true, render the "Rabattierter Preis" column populated
   * from `discounted_price` on each line item. Hidden entirely otherwise.
   */
  priceLookupEnabled?: boolean;
}

function formatCurrency(
  amount: number | null | undefined,
  currency: string | null,
  nullPlaceholder: string = "-"
): string {
  if (amount === null || amount === undefined) return nullPlaceholder;
  const curr = currency ?? "EUR";
  try {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: curr,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${curr}`;
  }
}

/**
 * OPH-16: Read-only line items table for the magic-link preview page.
 * Displays article number, description, quantity, unit price, and total.
 *
 * OPH-109: Optionally displays a "Rabattierter Preis" column when the
 * tenant has the price-lookup add-on enabled.
 */
export function LineItemsTable({
  lineItems,
  totalAmount,
  currency,
  priceLookupEnabled = false,
}: LineItemsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Package className="h-4 w-4 text-primary" />
          Positionen ({lineItems.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm" aria-label="Bestellpositionen">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="w-10 px-3 py-2 text-left font-medium text-muted-foreground">
                  #
                </th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground sm:table-cell">
                  Herst.-Art.-Nr.
                </th>
                <th className="hidden px-3 py-2 text-left font-medium text-muted-foreground lg:table-cell">
                  Händler-Art.-Nr.
                </th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                  Beschreibung
                </th>
                <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                  Menge
                </th>
                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground md:table-cell">
                  Einzelpreis
                </th>
                {priceLookupEnabled && (
                  <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground md:table-cell">
                    Rabatt (%)
                  </th>
                )}
                {priceLookupEnabled && (
                  <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground md:table-cell">
                    Rabattierter Preis
                  </th>
                )}
                <th className="hidden px-3 py-2 text-right font-medium text-muted-foreground sm:table-cell">
                  Gesamt
                </th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((item) => (
                <tr key={item.position} className="border-b last:border-0">
                  <td className="px-3 py-2 text-muted-foreground">
                    {item.position}
                  </td>
                  <td className="hidden px-3 py-2 font-mono text-xs sm:table-cell">
                    {item.article_number ?? (
                      <span className="italic text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="hidden px-3 py-2 font-mono text-xs lg:table-cell">
                    {item.dealer_article_number ?? (
                      <span className="italic text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2 sm:max-w-[300px]">
                    {item.description || (
                      <span className="italic text-muted-foreground">
                        Keine Beschreibung
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {item.quantity}
                    {item.unit && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        {item.unit}
                      </span>
                    )}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-right md:table-cell">
                    {formatCurrency(item.unit_price, item.currency ?? currency)}
                  </td>
                  {priceLookupEnabled && (
                    <td className="hidden whitespace-nowrap px-3 py-2 text-right md:table-cell tabular-nums">
                      {item.discount_rate !== null && item.discount_rate !== undefined
                        ? item.discount_rate.toFixed(2).replace(".", ",") + " %"
                        : "—"}
                    </td>
                  )}
                  {priceLookupEnabled && (
                    <td className="hidden whitespace-nowrap px-3 py-2 text-right md:table-cell">
                      {formatCurrency(item.discounted_price, item.currency ?? currency, "—")}
                    </td>
                  )}
                  <td className="hidden whitespace-nowrap px-3 py-2 text-right font-medium sm:table-cell">
                    {formatCurrency(item.total_price, item.currency ?? currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            {totalAmount !== null && (
              <tfoot>
                <tr className="bg-muted/30 font-medium">
                  <td
                    colSpan={priceLookupEnabled ? 8 : 6}
                    className="hidden px-3 py-2 text-right sm:table-cell"
                  >
                    Gesamt
                  </td>
                  <td
                    colSpan={3}
                    className="px-3 py-2 text-right sm:hidden"
                  >
                    Gesamt
                  </td>
                  <td className="hidden px-3 py-2 text-right sm:table-cell">
                    {formatCurrency(totalAmount, currency)}
                  </td>
                  <td className="px-3 py-2 text-right sm:hidden">
                    {formatCurrency(totalAmount, currency)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
