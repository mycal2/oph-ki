import { XMLParser } from "fast-xml-parser";
import type { CanonicalOrderData } from "@/lib/types";

const SCHEMA_VERSION = "1.0.0";

/**
 * Checks whether the raw XML text is a PEPPOL UBL Order document.
 * Looks for the PEPPOL customization ID or the UBL Order-2 namespace.
 */
export function isPeppolUblXml(xmlText: string): boolean {
  // Quick text-based check before parsing (cheaper than full parse)
  return (
    xmlText.includes("peppol.eu") ||
    xmlText.includes("urn:oasis:names:specification:ubl:schema:xsd:Order-2") ||
    xmlText.includes("urn:oasis:names:specification:ubl:schema:xsd:Order-") ||
    // Also check for common PEPPOL namespace prefixes with Order root element
    (xmlText.includes("<Order") && xmlText.includes("oasis"))
  );
}

// ---------------------------------------------------------------------------
// Helpers to navigate the parsed XML tree regardless of namespace prefixes
// ---------------------------------------------------------------------------

/**
 * fast-xml-parser with removeNSPrefix=true strips namespace prefixes, but some
 * documents use default namespaces (no prefix) while others use ns3:, cbc:, etc.
 * This helper resolves a value from the parsed object by trying the key as-is
 * first, then looking for any key that ends with `:${localName}`.
 */
function resolve(obj: Record<string, unknown> | undefined, localName: string): unknown {
  if (!obj) return undefined;
  // Direct match (namespace prefix already stripped or no prefix)
  if (localName in obj) return obj[localName];
  // Prefixed match (e.g. "cbc:ID")
  for (const key of Object.keys(obj)) {
    if (key.endsWith(`:${localName}`)) return obj[key];
  }
  return undefined;
}

/** Resolve and coerce to string. Returns null if not found. */
function resolveStr(obj: Record<string, unknown> | undefined, localName: string): string | null {
  const val = resolve(obj, localName);
  if (val == null) return null;
  // fast-xml-parser may return numbers for numeric-looking IDs; coerce to string
  if (typeof val === "object" && val !== null && "#text" in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>)["#text"]);
  }
  return String(val);
}

/** Resolve and coerce to number. Returns null if not found or not numeric. */
function resolveNum(obj: Record<string, unknown> | undefined, localName: string): number | null {
  const val = resolve(obj, localName);
  if (val == null) return null;
  // Handle objects with #text (from attribute nodes)
  let raw: unknown = val;
  if (typeof raw === "object" && raw !== null && "#text" in (raw as Record<string, unknown>)) {
    raw = (raw as Record<string, unknown>)["#text"];
  }
  const num = Number(raw);
  return isNaN(num) ? null : num;
}

/** Resolve a nested element (returns the sub-object or undefined). */
function resolveObj(obj: Record<string, unknown> | undefined, localName: string): Record<string, unknown> | undefined {
  const val = resolve(obj, localName);
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return undefined;
}

/** Ensures a value is always an array (fast-xml-parser returns single items as objects). */
function ensureArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) return val;
  return [val];
}

/** Extract a currency code from a *Amount element that has a @_currencyID attribute. */
function resolveCurrency(obj: Record<string, unknown> | undefined, localName: string): string | null {
  const val = resolve(obj, localName);
  if (val && typeof val === "object" && val !== null) {
    const record = val as Record<string, unknown>;
    if ("@_currencyID" in record) return String(record["@_currencyID"]);
  }
  return null;
}

/**
 * Parses a PEPPOL UBL Order XML into the canonical order data format.
 * Uses `fast-xml-parser` which is XXE-safe by design (no external entity resolution).
 *
 * Returns null if the XML cannot be parsed as a valid PEPPOL UBL Order.
 */
export function parsePeppolXml(xmlText: string): CanonicalOrderData | null {
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
      // Preserve text content alongside attributes
      textNodeName: "#text",
      // Do not trim whitespace from values
      trimValues: true,
      // Parse tag values: keep everything as strings to avoid number coercion issues
      parseTagValue: true,
      // Ensure arrays for elements that can repeat
      isArray: (name) => name === "OrderLine" || name === "AdditionalDocumentReference",
    });

    const parsed = parser.parse(xmlText);

    // Find the Order root element (may be namespaced)
    const order =
      resolveObj(parsed as Record<string, unknown>, "Order") ??
      (parsed as Record<string, unknown>);

    if (!order) return null;

    // --- Header fields ---
    const orderId = resolveStr(order, "ID");
    const issueDate = resolveStr(order, "IssueDate");

    // --- Buyer (sender) ---
    const buyerParty = resolveObj(order, "BuyerCustomerParty");
    const buyerPartyInner = resolveObj(buyerParty, "Party");
    const buyerLegalEntity = resolveObj(buyerPartyInner, "PartyLegalEntity");
    const buyerPostalAddress = resolveObj(buyerPartyInner, "PostalAddress");
    const buyerContact = resolveObj(buyerPartyInner, "Contact");

    const senderCompanyName =
      resolveStr(buyerLegalEntity, "RegistrationName") ??
      resolveStr(resolveObj(buyerPartyInner, "PartyName"), "Name");

    const senderStreet = buyerPostalAddress
      ? [resolveStr(buyerPostalAddress, "StreetName"), resolveStr(buyerPostalAddress, "AdditionalStreetName")]
          .filter(Boolean)
          .join(" ") || null
      : null;

    const senderCity = resolveStr(buyerPostalAddress, "CityName");
    const senderPostalCode = resolveStr(buyerPostalAddress, "PostalZone");
    const senderCountry = resolveStr(
      resolveObj(buyerPostalAddress, "Country"),
      "IdentificationCode"
    );
    const senderEmail = resolveStr(buyerContact, "ElectronicMail");
    const senderPhone = resolveStr(buyerContact, "Telephone");

    // Try to extract customer number from BuyerCustomerParty/SupplierAssignedAccountID
    const customerNumber = resolveStr(buyerParty, "SupplierAssignedAccountID");

    // --- Seller (manufacturer / supplier) ---
    // Not mapped to canonical output directly, but could be used for dealer context

    // --- Delivery address ---
    const delivery = resolveObj(order, "Delivery");
    const deliveryLocation = resolveObj(delivery, "DeliveryLocation");
    const deliveryAddress = resolveObj(deliveryLocation, "Address");

    let deliveryData: CanonicalOrderData["order"]["delivery_address"] = null;
    if (deliveryAddress) {
      const deliveryStreet = [
        resolveStr(deliveryAddress, "StreetName"),
        resolveStr(deliveryAddress, "AdditionalStreetName"),
      ]
        .filter(Boolean)
        .join(" ") || null;

      deliveryData = {
        company: resolveStr(deliveryAddress, "Department") ?? null,
        street: deliveryStreet,
        city: resolveStr(deliveryAddress, "CityName"),
        postal_code: resolveStr(deliveryAddress, "PostalZone"),
        country: resolveStr(
          resolveObj(deliveryAddress, "Country"),
          "IdentificationCode"
        ),
      };
    }

    // --- Line items ---
    const orderLines = ensureArray(resolve(order, "OrderLine") as Record<string, unknown>[] | Record<string, unknown>);

    const lineItems = orderLines.map((orderLine, idx) => {
      const line = resolveObj(orderLine as Record<string, unknown>, "LineItem") ?? (orderLine as Record<string, unknown>);

      const lineId = resolveStr(line, "ID");
      const quantity = resolveNum(line, "Quantity");
      const lineExtensionAmount = resolveNum(line, "LineExtensionAmount");
      const currency = resolveCurrency(line, "LineExtensionAmount");

      // Price
      const priceObj = resolveObj(line, "Price");
      const unitPrice = resolveNum(priceObj, "PriceAmount");

      // Item
      const item = resolveObj(line, "Item");
      const description = resolveStr(item, "Name") ?? resolveStr(item, "Description") ?? "";

      // Article numbers
      const sellersId = resolveObj(item, "SellersItemIdentification");
      const articleNumber = resolveStr(sellersId, "ID");

      const buyersId = resolveObj(item, "BuyersItemIdentification");
      const dealerArticleNumber = resolveStr(buyersId, "ID");

      // Unit from quantity attribute
      const quantityNode = resolve(line, "Quantity");
      let unit: string | null = null;
      if (quantityNode && typeof quantityNode === "object" && quantityNode !== null) {
        const unitCode = (quantityNode as Record<string, unknown>)["@_unitCode"];
        if (unitCode) {
          unit = mapUblUnitToGerman(String(unitCode));
        }
      }

      return {
        position: lineId ? parseInt(lineId, 10) || (idx + 1) : idx + 1,
        article_number: articleNumber,
        dealer_article_number: dealerArticleNumber,
        description,
        quantity: quantity ?? 0,
        unit,
        unit_price: unitPrice,
        total_price: lineExtensionAmount,
        currency: currency ?? null,
      };
    });

    // --- Totals ---
    const anticipatedMonetaryTotal = resolveObj(order, "AnticipatedMonetaryTotal");
    const totalAmount = resolveNum(anticipatedMonetaryTotal, "PayableAmount") ??
      resolveNum(anticipatedMonetaryTotal, "TaxExclusiveAmount") ??
      resolveNum(anticipatedMonetaryTotal, "LineExtensionAmount");
    const totalCurrency = resolveCurrency(anticipatedMonetaryTotal, "PayableAmount") ??
      resolveCurrency(anticipatedMonetaryTotal, "TaxExclusiveAmount") ??
      (lineItems.length > 0 ? lineItems[0].currency : null);

    // --- Notes ---
    const noteRaw = resolve(order, "Note");
    const notes = noteRaw ? String(typeof noteRaw === "object" && noteRaw !== null && "#text" in (noteRaw as Record<string, unknown>) ? (noteRaw as Record<string, unknown>)["#text"] : noteRaw) : null;

    // --- Detect document language from note or description text ---
    const sampleText = [notes, ...lineItems.map((li) => li.description)].filter(Boolean).join(" ");
    const documentLanguage = detectLanguageFromText(sampleText);

    const canonicalData: CanonicalOrderData = {
      document_language: documentLanguage,
      order: {
        order_number: orderId,
        order_date: issueDate,
        dealer: { id: null, name: null },
        sender: {
          company_name: senderCompanyName,
          street: senderStreet,
          city: senderCity,
          postal_code: senderPostalCode,
          country: senderCountry,
          email: senderEmail,
          phone: senderPhone,
          customer_number: customerNumber,
        },
        delivery_address: deliveryData,
        billing_address: null,
        line_items: lineItems,
        total_amount: totalAmount,
        currency: totalCurrency,
        notes,
        email_subject: null,
      },
      extraction_metadata: {
        schema_version: SCHEMA_VERSION,
        confidence_score: 0.98, // Deterministic parsing is near-perfect for known format
        model: "peppol-ubl-deterministic",
        extracted_at: new Date().toISOString(),
        source_files: [],
        dealer_hints_applied: false,
        column_mapping_applied: false,
        input_tokens: 0,
        output_tokens: 0,
      },
    };

    // Validate: if no line items were extracted, parsing likely failed
    if (lineItems.length === 0 && !orderId) {
      return null;
    }

    return canonicalData;
  } catch (error) {
    console.error("PEPPOL XML parsing error:", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// UBL unit code to German standard term mapping (UN/ECE Rec. 20 codes)
// ---------------------------------------------------------------------------

const UBL_UNIT_MAP: Record<string, string> = {
  C62: "Stueck", // one (piece)
  EA: "Stueck",  // each
  H87: "Stueck", // piece
  XPK: "Packung", // package
  PK: "Packung",
  XBX: "Karton", // box
  BX: "Karton",
  XCT: "Karton", // carton
  CT: "Karton",
  CS: "Karton",  // case
  BO: "Flasche", // bottle
  XBO: "Flasche",
  CA: "Dose",    // can
  TU: "Tube",    // tube
  XBG: "Beutel", // bag
  BG: "Beutel",
  XRO: "Rolle",  // roll
  RO: "Rolle",
  PR: "Paar",    // pair
  SET: "Set",
  LTR: "Liter",  // litre
  MLT: "Milliliter", // millilitre
  GRM: "Gramm",  // gram
  KGM: "Kilogramm", // kilogram
  MTR: "Meter",  // metre
};

function mapUblUnitToGerman(unitCode: string): string {
  return UBL_UNIT_MAP[unitCode.toUpperCase()] ?? unitCode;
}

// ---------------------------------------------------------------------------
// Simple language detection heuristic
// ---------------------------------------------------------------------------

function detectLanguageFromText(text: string): string | null {
  if (!text || text.trim().length < 10) return null;

  const lower = text.toLowerCase();

  // German indicators
  const deWords = ["bestell", "menge", "preis", "lieferung", "artikel", "bestellung", "und", "der", "die", "das"];
  // English indicators
  const enWords = ["order", "quantity", "price", "delivery", "article", "item", "and", "the"];
  // Swedish indicators
  const svWords = ["leverans", "antal", "pris", "order", "och", "gatan"];
  // French indicators
  const frWords = ["commande", "quantite", "prix", "livraison", "article", "est"];

  const countMatches = (words: string[]) => words.filter((w) => lower.includes(w)).length;

  const scores: [string, number][] = [
    ["DE", countMatches(deWords)],
    ["EN", countMatches(enWords)],
    ["SV", countMatches(svWords)],
    ["FR", countMatches(frWords)],
  ];

  scores.sort((a, b) => b[1] - a[1]);
  if (scores[0][1] >= 2) return scores[0][0];

  return null;
}
