"use client";

import { useState } from "react";
import Link from "next/link";
import { Minus, Plus, X, ShoppingCart, Search, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useBasket } from "@/hooks/use-basket";
import { useSfBasePath } from "@/hooks/use-sf-base-path";
import type { BasketItem } from "@/hooks/use-basket";

interface BasketViewProps {
  slug: string;
}

/**
 * OPH-77: Shopping basket view for the Salesforce App.
 *
 * Shows all basket items with quantity controls (+/- buttons and direct input),
 * remove button, total item count, empty state, and a sticky footer with
 * "Warenkorb leeren" and "Zur Kasse" actions.
 */
export function BasketView({ slug }: BasketViewProps) {
  const { items, itemCount, clearBasket } = useBasket();
  const basePath = useSfBasePath(slug);

  // Empty state
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ShoppingCart className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h2 className="text-lg font-semibold mb-2">Ihr Warenkorb ist leer</h2>
        <p className="text-sm text-muted-foreground max-w-xs mb-6">
          Suchen Sie nach Artikeln und fügen Sie diese zu Ihrem Warenkorb hinzu.
        </p>
        <Link href={`${basePath}`}>
          <Button variant="outline">
            <Search className="h-4 w-4" />
            Zur Artikelsuche
          </Button>
        </Link>
      </div>
    );
  }

  const lineItemCount = items.length;

  return (
    <div className="flex flex-col pb-36">
      {/* Header with item count */}
      <div className="mb-4">
        <h1 className="text-lg font-semibold">Warenkorb</h1>
        <p className="text-sm text-muted-foreground">
          {lineItemCount} {lineItemCount === 1 ? "Artikel" : "Artikel"},{" "}
          {itemCount} {itemCount === 1 ? "Einheit" : "Einheiten"} gesamt
        </p>
      </div>

      {/* Scrollable basket items */}
      <div className="flex flex-col gap-3" role="list" aria-label="Warenkorb-Artikel">
        {items.map((item) => (
          <BasketItemRow key={item.article.id} item={item} />
        ))}
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background p-4">
        <div className="mx-auto flex max-w-lg gap-3">
          {/* Clear basket with confirmation */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="shrink-0">
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Leeren</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Warenkorb leeren?</AlertDialogTitle>
                <AlertDialogDescription>
                  Alle {lineItemCount} Artikel werden aus Ihrem Warenkorb
                  entfernt. Diese Aktion kann nicht rückgängig gemacht werden.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                <AlertDialogAction onClick={clearBasket}>
                  Ja, Warenkorb leeren
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Checkout button */}
          <Button className="flex-1 font-semibold" asChild>
            <Link href={`${basePath}/checkout`}>
              Zur Kasse
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BasketItemRow
// ---------------------------------------------------------------------------

interface BasketItemRowProps {
  item: BasketItem;
}

function BasketItemRow({ item }: BasketItemRowProps) {
  const { setQuantity, removeFromBasket } = useBasket();
  const [inputValue, setInputValue] = useState(String(item.quantity));

  const handleDecrement = () => {
    const newQty = item.quantity - 1;
    if (newQty <= 0) {
      removeFromBasket(item.article.id);
    } else {
      setQuantity(item.article.id, newQty);
      setInputValue(String(newQty));
    }
  };

  const handleIncrement = () => {
    const newQty = item.quantity + 1;
    setQuantity(item.article.id, newQty);
    setInputValue(String(newQty));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);

    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setQuantity(item.article.id, parsed);
    }
  };

  const handleInputBlur = () => {
    const parsed = parseInt(inputValue, 10);
    if (isNaN(parsed) || parsed <= 0) {
      // Reset to current quantity if invalid input
      setInputValue(String(item.quantity));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
  };

  // Build packaging / size detail string
  const details: string[] = [];
  if (item.article.packaging) details.push(item.article.packaging);
  if (item.article.size1) details.push(item.article.size1);
  if (item.article.size2) details.push(item.article.size2);

  return (
    <div
      role="listitem"
      className="flex items-start gap-3 rounded-lg border bg-card p-4"
    >
      {/* Article info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-primary tabular-nums">
          {item.article.article_number}
        </p>
        <p className="text-sm font-medium leading-snug mt-0.5 break-words">
          {item.article.name}
        </p>
        {details.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {details.join(" / ")}
          </p>
        )}

        {/* Quantity controls */}
        <div className="mt-3 flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleDecrement}
            aria-label={`Menge verringern für ${item.article.name}`}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <Input
            type="number"
            min={1}
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            className="h-8 w-14 text-center tabular-nums text-sm px-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            aria-label={`Menge für ${item.article.name}`}
          />
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleIncrement}
            aria-label={`Menge erhöhen für ${item.article.name}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Remove button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => removeFromBasket(item.article.id)}
        aria-label={`${item.article.name} entfernen`}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
