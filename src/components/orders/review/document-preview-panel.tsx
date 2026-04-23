"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { FileText, Download, ExternalLink, Loader2, AlertCircle, Mail, Table2, Code2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { FilePreviewUrl, ApiResponse, PreviewUrlResponse } from "@/lib/types";

interface DocumentPreviewPanelProps {
  orderId: string;
}

/** Check whether a file should be rendered as inline text. */
function isTextFile(file: FilePreviewUrl): boolean {
  return (
    file.mimeType === "text/plain" ||
    file.filename === "email_body.txt"
  );
}

/** Check whether a file is an Excel or CSV spreadsheet that should be rendered as a table. */
function isSpreadsheetFile(file: FilePreviewUrl): boolean {
  const lowerFilename = file.filename.toLowerCase();
  return (
    file.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.mimeType === "application/vnd.ms-excel" ||
    file.mimeType === "text/csv" ||
    (file.mimeType === "application/octet-stream" &&
      (lowerFilename.endsWith(".xlsx") || lowerFilename.endsWith(".xls") || lowerFilename.endsWith(".csv"))) ||
    lowerFilename.endsWith(".xlsx") ||
    lowerFilename.endsWith(".xls") ||
    lowerFilename.endsWith(".csv")
  );
}

/** Check whether a file is an XML document that should be rendered as a structured table. */
function isXmlFile(file: FilePreviewUrl): boolean {
  const lowerFilename = file.filename.toLowerCase();
  return (
    file.mimeType === "application/xml" ||
    file.mimeType === "text/xml" ||
    (file.mimeType === "application/octet-stream" && lowerFilename.endsWith(".xml")) ||
    lowerFilename.endsWith(".xml")
  );
}

// ---------------------------------------------------------------------------
// PEPPOL UBL XML parsed types for the browser-side preview
// ---------------------------------------------------------------------------

interface PeppolOrderHeader {
  orderNumber: string | null;
  issueDate: string | null;
  buyerName: string | null;
}

interface PeppolLineItem {
  position: number;
  articleNumber: string | null;
  dealerArticleNumber: string | null;
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
}

interface PeppolParsedOrder {
  header: PeppolOrderHeader;
  lineItems: PeppolLineItem[];
}

// ---------------------------------------------------------------------------
// Browser-side PEPPOL UBL parser using DOMParser
// ---------------------------------------------------------------------------

/**
 * Checks whether the XML text is a PEPPOL UBL Order by looking for known identifiers.
 */
function isPeppolUbl(xmlText: string): boolean {
  return (
    xmlText.includes("peppol.eu") ||
    xmlText.includes("urn:oasis:names:specification:ubl:schema:xsd:Order-2") ||
    xmlText.includes("urn:oasis:names:specification:ubl:schema:xsd:Order-") ||
    (xmlText.includes("<Order") && xmlText.includes("oasis"))
  );
}

/**
 * Resolves an element by local name, ignoring namespace prefixes.
 * DOMParser preserves namespaces so we look for elements with matching localName.
 */
function findElement(parent: Element, localName: string): Element | null {
  // Try getElementsByTagNameNS with wildcard namespace first
  const byNs = parent.getElementsByTagNameNS("*", localName);
  if (byNs.length > 0) return byNs[0];
  return null;
}

/**
 * Returns all direct/descendant elements with matching local name.
 */
function findAllElements(parent: Element, localName: string): Element[] {
  const byNs = parent.getElementsByTagNameNS("*", localName);
  return Array.from(byNs);
}

/**
 * Gets the text content of a child element by local name.
 */
function getChildText(parent: Element, localName: string): string | null {
  const el = findElement(parent, localName);
  return el?.textContent?.trim() ?? null;
}

/**
 * Gets a numeric value from a child element.
 */
function getChildNumber(parent: Element, localName: string): number | null {
  const text = getChildText(parent, localName);
  if (text == null) return null;
  const num = parseFloat(text);
  return isNaN(num) ? null : num;
}

/**
 * Parses a PEPPOL UBL Order XML into a structured object for preview rendering.
 * Returns null if the document structure cannot be understood.
 */
function parsePeppolUblForPreview(xmlText: string): PeppolParsedOrder | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");

    // Check for parse errors
    const parseError = doc.querySelector("parsererror");
    if (parseError) return null;

    // Find root Order element
    const orderEl =
      doc.getElementsByTagNameNS("*", "Order")[0] ?? doc.documentElement;
    if (!orderEl) return null;

    // --- Header ---
    const orderNumber = getChildText(orderEl, "ID");
    const issueDate = getChildText(orderEl, "IssueDate");

    // Buyer name: BuyerCustomerParty > Party > PartyLegalEntity > RegistrationName
    // OR BuyerCustomerParty > Party > PartyName > Name
    let buyerName: string | null = null;
    const buyerCustomerParty = findElement(orderEl, "BuyerCustomerParty");
    if (buyerCustomerParty) {
      const party = findElement(buyerCustomerParty, "Party");
      if (party) {
        const legalEntity = findElement(party, "PartyLegalEntity");
        buyerName = legalEntity
          ? getChildText(legalEntity, "RegistrationName")
          : null;
        if (!buyerName) {
          const partyName = findElement(party, "PartyName");
          buyerName = partyName ? getChildText(partyName, "Name") : null;
        }
      }
    }

    // --- Line Items ---
    const orderLineEls = findAllElements(orderEl, "OrderLine");
    const lineItems: PeppolLineItem[] = [];

    orderLineEls.forEach((orderLineEl, idx) => {
      const lineItemEl = findElement(orderLineEl, "LineItem") ?? orderLineEl;

      const lineId = getChildText(lineItemEl, "ID");
      const quantity = getChildNumber(lineItemEl, "Quantity");
      const lineExtensionAmount = getChildNumber(lineItemEl, "LineExtensionAmount");

      // Price > PriceAmount
      const priceEl = findElement(lineItemEl, "Price");
      const unitPrice = priceEl ? getChildNumber(priceEl, "PriceAmount") : null;

      // Item > Name, Item > SellersItemIdentification > ID, Item > BuyersItemIdentification > ID
      const itemEl = findElement(lineItemEl, "Item");
      const description = itemEl
        ? (getChildText(itemEl, "Name") ?? getChildText(itemEl, "Description") ?? "")
        : "";

      const sellersIdEl = itemEl ? findElement(itemEl, "SellersItemIdentification") : null;
      const articleNumber = sellersIdEl ? getChildText(sellersIdEl, "ID") : null;

      const buyersIdEl = itemEl ? findElement(itemEl, "BuyersItemIdentification") : null;
      const dealerArticleNumber = buyersIdEl ? getChildText(buyersIdEl, "ID") : null;

      lineItems.push({
        position: lineId ? parseInt(lineId, 10) || (idx + 1) : idx + 1,
        articleNumber,
        dealerArticleNumber,
        description,
        quantity,
        unitPrice,
        totalPrice: lineExtensionAmount,
      });
    });

    return {
      header: { orderNumber, issueDate, buyerName },
      lineItems,
    };
  } catch {
    return null;
  }
}

/**
 * Formats a number as a currency-like string with two decimal places.
 */
function formatPrice(value: number | null): string {
  if (value == null) return "-";
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Simple XML syntax highlighter — returns React elements with colored spans.
 * Tokenizes tags, attributes, attribute values, comments, and text content.
 */
function highlightXml(xml: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Regex to match XML tokens: comments, CDATA, processing instructions, tags, and text
  const tokenRegex = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[^>]+\/?>|[^<]+/g;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = tokenRegex.exec(xml)) !== null) {
    const token = match[0];

    if (token.startsWith("<!--")) {
      // Comment
      nodes.push(<span key={key++} className="text-zinc-500 italic">{token}</span>);
    } else if (token.startsWith("<?")) {
      // Processing instruction (<?xml ... ?>)
      nodes.push(<span key={key++} className="text-zinc-400">{token}</span>);
    } else if (token.startsWith("<")) {
      // Tag — tokenize the inside for attributes
      highlightTag(token, nodes, key);
      key += 1;
    } else {
      // Text content
      const trimmed = token.trim();
      if (trimmed.length > 0) {
        nodes.push(<span key={key++} className="text-zinc-200">{token}</span>);
      } else {
        nodes.push(<span key={key++}>{token}</span>);
      }
    }
  }

  return nodes;
}

function highlightTag(tag: string, nodes: React.ReactNode[], baseKey: number) {
  // Split tag into parts: tag name, attributes, closing bracket
  const parts: React.ReactNode[] = [];
  // Match: < or </ , tag name, then pairs of attr=value, then > or />
  const attrRegex = /([a-zA-Z_][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;

  // Find the tag name boundary
  const isClosing = tag.startsWith("</");
  const isSelfClosing = tag.endsWith("/>");
  const prefix = isClosing ? "</" : "<";
  const suffix = isSelfClosing ? "/>" : ">";

  // Strip prefix and suffix to get inner content
  const inner = tag.slice(prefix.length, tag.length - suffix.length).trim();

  // First token in inner is the tag name
  const spaceIdx = inner.search(/\s/);
  const tagName = spaceIdx === -1 ? inner : inner.slice(0, spaceIdx);
  const attrsPart = spaceIdx === -1 ? "" : inner.slice(spaceIdx);

  parts.push(<span key="b1" className="text-zinc-500">{prefix}</span>);
  parts.push(<span key="tn" className="text-sky-400">{tagName}</span>);

  if (attrsPart.trim().length > 0) {
    let attrMatch: RegExpExecArray | null;
    let lastIndex = 0;
    attrRegex.lastIndex = 0;
    let attrKey = 0;

    while ((attrMatch = attrRegex.exec(attrsPart)) !== null) {
      // Whitespace before attr
      if (attrMatch.index > lastIndex) {
        parts.push(<span key={`ws${attrKey}`}>{attrsPart.slice(lastIndex, attrMatch.index)}</span>);
      }
      const attrName = attrMatch[1];
      const attrVal = attrMatch[2] ?? attrMatch[3];

      parts.push(<span key={`an${attrKey}`} className="text-amber-300">{attrName}</span>);
      if (attrVal !== undefined) {
        parts.push(<span key={`eq${attrKey}`} className="text-zinc-500">=</span>);
        parts.push(<span key={`av${attrKey}`} className="text-emerald-400">&quot;{attrVal}&quot;</span>);
      }
      lastIndex = attrMatch.index + attrMatch[0].length;
      attrKey++;
    }
    if (lastIndex < attrsPart.length) {
      parts.push(<span key="trail">{attrsPart.slice(lastIndex)}</span>);
    }
  }

  parts.push(<span key="b2" className="text-zinc-500">{suffix}</span>);

  nodes.push(<span key={baseKey}>{parts}</span>);
}

/**
 * Inline XML preview sub-component.
 * Fetches the file from the signed URL, parses as PEPPOL UBL if possible,
 * and renders a structured order table. Also offers a raw XML tab with syntax highlighting.
 */
function XmlFilePreview({ file }: { file: FilePreviewUrl }) {
  const [parsedOrder, setParsedOrder] = useState<PeppolParsedOrder | null>(null);
  const [rawXml, setRawXml] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [isLoadingXml, setIsLoadingXml] = useState(true);
  const [xmlError, setXmlError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"table" | "xml">("table");

  useEffect(() => {
    let cancelled = false;
    setIsLoadingXml(true);
    setXmlError(null);
    setParsedOrder(null);
    setRawXml(null);
    setIsSupported(true);
    setActiveTab("table");

    async function fetchAndParse() {
      try {
        const res = await fetch(file.signedUrl);

        if (!res.ok) {
          if (!cancelled) {
            setXmlError("XML-Datei konnte nicht geladen werden.");
          }
          return;
        }

        const xmlText = await res.text();
        if (!cancelled) {
          setRawXml(xmlText);
        }

        if (!isPeppolUbl(xmlText)) {
          if (!cancelled) {
            setIsSupported(false);
            setActiveTab("xml");
          }
          return;
        }

        const result = parsePeppolUblForPreview(xmlText);
        if (!cancelled) {
          if (result) {
            setParsedOrder(result);
          } else {
            setIsSupported(false);
            setActiveTab("xml");
          }
        }
      } catch {
        if (!cancelled) {
          setXmlError("Verbindungsfehler beim Laden der XML-Datei.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingXml(false);
        }
      }
    }

    fetchAndParse();
    return () => {
      cancelled = true;
    };
  }, [file.signedUrl]);

  // Memoize highlighted XML to avoid re-tokenizing on every render
  const highlightedXml = useMemo(() => {
    if (!rawXml) return null;
    return highlightXml(rawXml);
  }, [rawXml]);

  // Loading state
  if (isLoadingXml) {
    return (
      <div className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border bg-muted/20 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>XML wird geladen...</span>
        </div>
      </div>
    );
  }

  // Error state with download fallback
  if (xmlError) {
    return (
      <div className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border bg-muted/20 flex flex-col items-center justify-center gap-3 px-4">
        <Alert variant="destructive" className="max-w-sm">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{xmlError}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <a
            href={file.signedUrl}
            download={file.filename}
            aria-label={`${file.filename} herunterladen`}
          >
            <Download className="h-3.5 w-3.5" />
            Datei herunterladen
          </a>
        </Button>
      </div>
    );
  }

  const hasPeppolTable = isSupported && parsedOrder;
  const header = parsedOrder?.header;
  const lineItems = parsedOrder?.lineItems ?? [];

  return (
    <div className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border bg-background flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex gap-0 border-b bg-muted/30 shrink-0">
        {hasPeppolTable && (
          <button
            onClick={() => setActiveTab("table")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
              activeTab === "table"
                ? "border-primary text-primary bg-background"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
            aria-selected={activeTab === "table"}
            role="tab"
          >
            <Table2 className="h-3 w-3 inline-block mr-1 -mt-0.5" />
            Tabelle
          </button>
        )}
        <button
          onClick={() => setActiveTab("xml")}
          className={cn(
            "px-3 py-1.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
            activeTab === "xml"
              ? "border-primary text-primary bg-background"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
          aria-selected={activeTab === "xml"}
          role="tab"
        >
          <Code2 className="h-3 w-3 inline-block mr-1 -mt-0.5" />
          XML
        </button>
      </div>

      {/* Table view */}
      {activeTab === "table" && hasPeppolTable && (
        <>
          {/* Order header section */}
          <div className="shrink-0 border-b bg-muted/30 px-4 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground text-xs font-medium">Bestellnummer</span>
                <p className="font-semibold">{header?.orderNumber ?? "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs font-medium">Bestelldatum</span>
                <p className="font-semibold">{header?.issueDate ?? "-"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs font-medium">Käufer</span>
                <p className="font-semibold truncate" title={header?.buyerName ?? undefined}>
                  {header?.buyerName ?? "-"}
                </p>
              </div>
            </div>
          </div>

          {/* Line items table */}
          {lineItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
              <Table2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">Keine Positionen in dieser Bestellung.</p>
            </div>
          ) : (
            <div
              className="flex-1 overflow-auto min-h-0"
              role="region"
              aria-label={`XML-Bestellvorschau: ${file.filename}`}
            >
              <table className="text-xs border-collapse w-max min-w-full">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="bg-muted/80 backdrop-blur-sm border-b border-r px-2 py-1.5 text-left font-semibold text-foreground whitespace-nowrap">
                      Pos.
                    </th>
                    <th className="bg-muted/80 backdrop-blur-sm border-b border-r px-2 py-1.5 text-left font-semibold text-foreground whitespace-nowrap">
                      Artikel-Nr (Hersteller)
                    </th>
                    <th className="bg-muted/80 backdrop-blur-sm border-b border-r px-2 py-1.5 text-left font-semibold text-foreground whitespace-nowrap">
                      Händler-Art.-Nr
                    </th>
                    <th className="bg-muted/80 backdrop-blur-sm border-b border-r px-2 py-1.5 text-left font-semibold text-foreground whitespace-nowrap">
                      Beschreibung
                    </th>
                    <th className="bg-muted/80 backdrop-blur-sm border-b border-r px-2 py-1.5 text-right font-semibold text-foreground whitespace-nowrap">
                      Menge
                    </th>
                    <th className="bg-muted/80 backdrop-blur-sm border-b border-r px-2 py-1.5 text-right font-semibold text-foreground whitespace-nowrap">
                      Einzelpreis
                    </th>
                    <th className="bg-muted/80 backdrop-blur-sm border-b px-2 py-1.5 text-right font-semibold text-foreground whitespace-nowrap">
                      Gesamtpreis
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, idx) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="border-b border-r px-2 py-1 text-foreground/80 whitespace-nowrap text-center">
                        {item.position}
                      </td>
                      <td className="border-b border-r px-2 py-1 text-foreground/80 whitespace-nowrap font-mono">
                        {item.articleNumber ?? "-"}
                      </td>
                      <td className="border-b border-r px-2 py-1 text-foreground/80 whitespace-nowrap font-mono">
                        {item.dealerArticleNumber ?? "-"}
                      </td>
                      <td className="border-b border-r px-2 py-1 text-foreground/80">
                        {item.description || "-"}
                      </td>
                      <td className="border-b border-r px-2 py-1 text-foreground/80 whitespace-nowrap text-right tabular-nums">
                        {item.quantity != null ? item.quantity : "-"}
                      </td>
                      <td className="border-b border-r px-2 py-1 text-foreground/80 whitespace-nowrap text-right tabular-nums">
                        {formatPrice(item.unitPrice)}
                      </td>
                      <td className="border-b px-2 py-1 text-foreground/80 whitespace-nowrap text-right tabular-nums">
                        {formatPrice(item.totalPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Raw XML view with syntax highlighting */}
      {activeTab === "xml" && (
        <pre
          className="flex-1 overflow-auto min-h-0 bg-zinc-950 p-4 text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words"
          aria-label={`XML-Quellcode: ${file.filename}`}
        >
          {highlightedXml}
        </pre>
      )}
    </div>
  );
}

/**
 * Parsed sheet data: name + 2D array of cell values.
 */
interface ParsedSheet {
  name: string;
  data: (string | number | boolean | null)[][];
}

/**
 * Inline spreadsheet preview sub-component.
 * Fetches the file from the signed URL, parses with SheetJS, and renders as a scrollable table.
 */
function SpreadsheetFilePreview({ file }: { file: FilePreviewUrl }) {
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [isLoadingSheet, setIsLoadingSheet] = useState(true);
  const [sheetError, setSheetError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingSheet(true);
    setSheetError(null);
    setSheets([]);
    setActiveSheetIndex(0);

    async function fetchAndParse() {
      try {
        const res = await fetch(file.signedUrl);

        if (!res.ok) {
          if (!cancelled) {
            setSheetError("Datei konnte nicht geladen werden.");
          }
          return;
        }

        const arrayBuffer = await res.arrayBuffer();

        // Dynamically import SheetJS to keep the initial bundle small
        const XLSX = await import("xlsx");

        const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
        const parsed: ParsedSheet[] = workbook.SheetNames.map((name) => {
          const sheet = workbook.Sheets[name];
          const json = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
            header: 1,
            defval: null,
          });
          return { name, data: json };
        });

        if (!cancelled) {
          setSheets(parsed);
        }
      } catch (err) {
        console.error("Error parsing spreadsheet:", err);
        if (!cancelled) {
          setSheetError("Datei konnte nicht verarbeitet werden. Bitte laden Sie die Datei herunter.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSheet(false);
        }
      }
    }

    fetchAndParse();
    return () => {
      cancelled = true;
    };
  }, [file.signedUrl]);

  const activeSheet = sheets[activeSheetIndex] ?? null;

  // Determine max columns across all rows for consistent table width
  const maxCols = useMemo(() => {
    if (!activeSheet) return 0;
    return activeSheet.data.reduce((max, row) => Math.max(max, row.length), 0);
  }, [activeSheet]);

  // Loading state
  if (isLoadingSheet) {
    return (
      <div className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border bg-muted/20 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Excel wird geladen...</span>
        </div>
      </div>
    );
  }

  // Error state with download fallback
  if (sheetError) {
    return (
      <div className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border bg-muted/20 flex flex-col items-center justify-center gap-3 px-4">
        <Alert variant="destructive" className="max-w-sm">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{sheetError}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <a
            href={file.signedUrl}
            download={file.filename}
            aria-label={`${file.filename} herunterladen`}
          >
            <Download className="h-3.5 w-3.5" />
            Datei herunterladen
          </a>
        </Button>
      </div>
    );
  }

  // No sheets at all (unlikely but defensive)
  if (sheets.length === 0) {
    return (
      <div className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border bg-muted/20 flex flex-col items-center justify-center text-center">
        <Table2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">Keine Daten in dieser Datei.</p>
      </div>
    );
  }

  // Check if active sheet is empty
  const isEmptySheet = !activeSheet || activeSheet.data.length === 0;

  return (
    <div className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border bg-background flex flex-col overflow-hidden">
      {/* Sheet tabs (only if multiple sheets) */}
      {sheets.length > 1 && (
        <div className="flex gap-0 border-b bg-muted/30 overflow-x-auto shrink-0">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              onClick={() => setActiveSheetIndex(i)}
              className={cn(
                "px-3 py-1.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
                i === activeSheetIndex
                  ? "border-primary text-primary bg-background"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
              aria-label={`Blatt: ${s.name}`}
              aria-selected={i === activeSheetIndex}
              role="tab"
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Table content */}
      {isEmptySheet ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <Table2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">Keine Daten in diesem Blatt.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto min-h-0" role="region" aria-label={`Tabellenvorschau: ${activeSheet.name}`}>
          <table className="text-xs border-collapse w-max min-w-full">
            <thead className="sticky top-0 z-10">
              {activeSheet.data.length > 0 && (
                <tr>
                  {Array.from({ length: maxCols }, (_, colIdx) => (
                    <th
                      key={colIdx}
                      className="bg-muted/80 backdrop-blur-sm border-b border-r px-2 py-1.5 text-left font-semibold text-foreground whitespace-nowrap"
                    >
                      {activeSheet.data[0]?.[colIdx] != null
                        ? String(activeSheet.data[0][colIdx])
                        : ""}
                    </th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {activeSheet.data.slice(1).map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-muted/20">
                  {Array.from({ length: maxCols }, (_, colIdx) => (
                    <td
                      key={colIdx}
                      className="border-b border-r px-2 py-1 text-foreground/80 whitespace-nowrap"
                    >
                      {row[colIdx] != null ? String(row[colIdx]) : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Inline text preview sub-component.
 * Fetches the text content from the signed URL and renders it in a scrollable block.
 */
function TextFilePreview({ file }: { file: FilePreviewUrl }) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoadingText, setIsLoadingText] = useState(true);
  const [textError, setTextError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingText(true);
    setTextError(null);
    setTextContent(null);

    async function fetchText() {
      try {
        const res = await fetch(file.signedUrl);

        if (!res.ok) {
          if (!cancelled) {
            setTextError("Text konnte nicht geladen werden.");
          }
          return;
        }

        const text = await res.text();
        if (!cancelled) {
          setTextContent(text);
        }
      } catch {
        if (!cancelled) {
          setTextError("Verbindungsfehler beim Laden des Textes.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingText(false);
        }
      }
    }

    fetchText();
    return () => {
      cancelled = true;
    };
  }, [file.signedUrl]);

  // Loading state
  if (isLoadingText) {
    return (
      <div className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border bg-muted/20 flex items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>E-Mail-Text wird geladen...</span>
        </div>
      </div>
    );
  }

  // Error state with download fallback
  if (textError) {
    return (
      <div className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border bg-muted/20 flex flex-col items-center justify-center gap-3 px-4">
        <Alert variant="destructive" className="max-w-sm">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{textError}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" asChild className="gap-1.5">
          <a
            href={file.signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${file.filename} herunterladen`}
          >
            <Download className="h-3.5 w-3.5" />
            Datei herunterladen
          </a>
        </Button>
      </div>
    );
  }

  // Empty file
  if (textContent !== null && textContent.length === 0) {
    return (
      <div className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border bg-muted/20 flex flex-col items-center justify-center text-center">
        <Mail className="h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          Kein E-Mail-Text vorhanden.
        </p>
      </div>
    );
  }

  // Rendered text content
  return (
    <pre
      className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border bg-muted/20 p-4 text-sm whitespace-pre-wrap break-words overflow-y-auto font-mono"
      aria-label={`Textinhalt: ${file.filename}`}
    >
      {textContent}
    </pre>
  );
}

/**
 * PDF preview sub-component.
 * When the stored MIME type is not application/pdf (e.g. application/octet-stream from
 * email ingestion), the browser would download instead of rendering inline. This component
 * fetches the file, creates a Blob with the correct type, and uses an object URL so the
 * browser's built-in PDF viewer renders it in the iframe.
 */
function PdfFilePreview({ file }: { file: FilePreviewUrl }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // If MIME type is already correct, use the signed URL directly (no fetch needed)
  const needsBlobFix = file.mimeType !== "application/pdf";

  useEffect(() => {
    if (!needsBlobFix) return;

    let cancelled = false;
    let objectUrl: string | null = null;
    setIsLoadingPdf(true);
    setPdfError(null);

    async function fetchAndCreateBlob() {
      try {
        const res = await fetch(file.signedUrl);
        if (!res.ok) {
          if (!cancelled) setPdfError("PDF konnte nicht geladen werden.");
          return;
        }
        const arrayBuffer = await res.arrayBuffer();
        const blob = new Blob([arrayBuffer], { type: "application/pdf" });
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setBlobUrl(objectUrl);
      } catch {
        if (!cancelled) setPdfError("Verbindungsfehler beim Laden der PDF.");
      } finally {
        if (!cancelled) setIsLoadingPdf(false);
      }
    }

    fetchAndCreateBlob();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.signedUrl, needsBlobFix]);

  if (pdfError) {
    return (
      <div className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border flex flex-col items-center justify-center text-center bg-muted/30">
        <AlertCircle className="h-8 w-8 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">{pdfError}</p>
      </div>
    );
  }

  if (needsBlobFix && isLoadingPdf) {
    return (
      <div className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border flex items-center justify-center bg-muted/20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const iframeSrc = needsBlobFix ? blobUrl : file.signedUrl;
  if (!iframeSrc) return null;

  return (
    <iframe
      src={iframeSrc}
      className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border"
      title={`Vorschau: ${file.filename}`}
    />
  );
}

/**
 * Left panel of the review page showing file previews.
 * PDFs are embedded via iframe using signed URLs.
 * Text files (email_body.txt) are rendered inline.
 * Non-PDF files show a download link fallback.
 */
export function DocumentPreviewPanel({ orderId }: DocumentPreviewPanelProps) {
  const [files, setFiles] = useState<FilePreviewUrl[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFileIndex, setActiveFileIndex] = useState(0);

  const fetchPreviewUrls = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/orders/${orderId}/preview-url`);
      const json = (await res.json()) as ApiResponse<PreviewUrlResponse>;

      if (!res.ok || !json.success || !json.data) {
        setError(json.error ?? "Vorschau-URLs konnten nicht geladen werden.");
        return;
      }

      setFiles(json.data.files);
    } catch {
      setError("Verbindungsfehler beim Laden der Vorschau.");
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchPreviewUrls();
  }, [fetchPreviewUrls]);

  // Shared sticky classes for the panel wrapper on desktop
  const stickyClasses = "lg:sticky lg:top-[4.25rem] lg:h-[calc(100vh-4.25rem-1.5rem)]";

  if (isLoading) {
    return (
      <Card className={cn("h-full", stickyClasses)}>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[500px] w-full rounded-md" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("h-full", stickyClasses)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dokument-Vorschau</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button variant="outline" size="sm" onClick={fetchPreviewUrls} className="mt-3">
            Erneut versuchen
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (files.length === 0) {
    return (
      <Card className={cn("h-full", stickyClasses)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dokument-Vorschau</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              Keine Dateien für die Vorschau verfügbar.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const activeFile = files[activeFileIndex];
  const isPdf = activeFile?.mimeType === "application/pdf" ||
    (activeFile?.mimeType === "application/octet-stream" && activeFile?.filename.toLowerCase().endsWith(".pdf"));
  const isImage = /^image\/(jpeg|jpg|png|webp|tiff|bmp)$/.test(activeFile?.mimeType ?? "");
  const isText = activeFile ? isTextFile(activeFile) : false;
  const isSpreadsheet = activeFile ? isSpreadsheetFile(activeFile) : false;
  const isXml = activeFile ? isXmlFile(activeFile) : false;

  return (
    <Card className={cn("h-full flex flex-col", stickyClasses)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Dokument-Vorschau</CardTitle>
          {activeFile && (
            <div className="flex items-center gap-1">
              {/* OPH-70/OPH-71/OPH-95: Download button for text, spreadsheet & XML files (secondary action) */}
              {(isText || isSpreadsheet || isXml) && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="gap-1.5 text-xs"
                >
                  <a
                    href={activeFile.signedUrl}
                    download={activeFile.filename}
                    aria-label={`${activeFile.filename} herunterladen`}
                  >
                    <Download className="h-3 w-3" />
                    Download
                  </a>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="gap-1.5 text-xs"
              >
                <a
                  href={activeFile.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${activeFile.filename} in neuem Tab öffnen`}
                >
                  <ExternalLink className="h-3 w-3" />
                  In neuem Tab
                </a>
              </Button>
            </div>
          )}
        </div>

        {/* File tabs */}
        {files.length > 1 && (
          <div className="flex gap-1 flex-wrap mt-2">
            {files.map((f, i) => (
              <Button
                key={f.fileId}
                variant={i === activeFileIndex ? "default" : "outline"}
                size="sm"
                className={cn("text-xs h-7 gap-1", i === activeFileIndex && "pointer-events-none")}
                onClick={() => setActiveFileIndex(i)}
              >
                {isTextFile(f) ? (
                  <Mail className="h-3 w-3" />
                ) : isSpreadsheetFile(f) ? (
                  <Table2 className="h-3 w-3" />
                ) : isXmlFile(f) ? (
                  <Code2 className="h-3 w-3" />
                ) : (
                  <FileText className="h-3 w-3" />
                )}
                <span className="truncate max-w-[100px]">{f.filename}</span>
              </Button>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="flex-1 min-h-0">
        {isPdf ? (
          <PdfFilePreview file={activeFile} />
        ) : isImage ? (
          <div className="w-full h-[500px] lg:h-full min-h-[400px] rounded-md border overflow-auto bg-muted/20 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeFile.signedUrl}
              alt={activeFile.filename}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        ) : isText ? (
          <TextFilePreview file={activeFile} />
        ) : isSpreadsheet ? (
          <SpreadsheetFilePreview file={activeFile} />
        ) : isXml ? (
          <XmlFilePreview file={activeFile} />
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center border rounded-md bg-muted/30">
            <FileText className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium mb-1">{activeFile.filename}</p>
            <p className="text-xs text-muted-foreground mb-4">
              Vorschau für diesen Dateityp nicht verfügbar.
            </p>
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <a
                href={activeFile.signedUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Download className="h-3.5 w-3.5" />
                Datei herunterladen
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
