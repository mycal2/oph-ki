import { z } from "zod";

/**
 * Zod validation schemas for OPH-1 API endpoints.
 */

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "E-Mail-Adresse ist erforderlich.")
    .email("Bitte geben Sie eine gueltige E-Mail-Adresse ein."),
  password: z
    .string()
    .min(1, "Passwort ist erforderlich."),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "E-Mail-Adresse ist erforderlich.")
    .email("Bitte geben Sie eine gueltige E-Mail-Adresse ein."),
});

export const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Passwort muss mindestens 8 Zeichen lang sein."),
  confirmPassword: z
    .string()
    .min(1, "Passwortbestaetigung ist erforderlich."),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwoerter stimmen nicht ueberein.",
  path: ["confirmPassword"],
});

export const inviteUserSchema = z.object({
  email: z
    .string()
    .min(1, "E-Mail-Adresse ist erforderlich.")
    .email("Bitte geben Sie eine gueltige E-Mail-Adresse ein."),
  role: z.enum(["tenant_user", "tenant_admin"], {
    message: "Bitte waehlen Sie eine gueltige Rolle.",
  }),
});

export const toggleUserStatusSchema = z.object({
  status: z.enum(["active", "inactive"], {
    message: "Ungueltiger Status.",
  }),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type ToggleUserStatusInput = z.infer<typeof toggleUserStatusSchema>;

/**
 * OPH-2: Upload validation schemas.
 */
const ALLOWED_EXTENSIONS_ZOD = [".eml", ".pdf", ".xlsx", ".xls", ".csv"] as const;

export const uploadPresignSchema = z.object({
  filename: z
    .string()
    .min(1, "Dateiname ist erforderlich.")
    .max(255, "Dateiname ist zu lang.")
    .refine(
      (name) => ALLOWED_EXTENSIONS_ZOD.some((ext) => name.toLowerCase().endsWith(ext)),
      { message: "Dateiformat nicht erlaubt. Erlaubt: .eml, .pdf, .xlsx, .xls, .csv" }
    ),
  fileSize: z
    .number()
    .int()
    .positive("Dateigröße muss positiv sein.")
    .max(25 * 1024 * 1024, "Datei ist zu groß. Maximum: 25 MB."),
  mimeType: z.string().min(1, "MIME-Typ ist erforderlich."),
  sha256Hash: z
    .string()
    .length(64, "Ungültiger SHA-256-Hash.")
    .regex(/^[a-f0-9]+$/, "Ungültiger SHA-256-Hash."),
});

export const uploadConfirmSchema = z.object({
  orderId: z.string().uuid("Ungültige Bestellungs-ID."),
  storagePath: z.string().min(1, "Speicherpfad ist erforderlich."),
  sha256Hash: z
    .string()
    .length(64, "Ungültiger SHA-256-Hash.")
    .regex(/^[a-f0-9]+$/, "Ungültiger SHA-256-Hash."),
  /** Original filename before sanitization — used for dealer recognition and DB storage. */
  originalFilename: z
    .string()
    .min(1, "Dateiname ist erforderlich.")
    .max(255, "Dateiname ist zu lang."),
});

export type UploadPresignInput = z.infer<typeof uploadPresignSchema>;
export type UploadConfirmInput = z.infer<typeof uploadConfirmSchema>;

/**
 * OPH-3: Dealer override validation schema.
 */
export const dealerOverrideSchema = z.object({
  dealerId: z.string().uuid("Ungueltige Haendler-ID."),
  reason: z
    .string()
    .max(500, "Begruendung darf maximal 500 Zeichen lang sein.")
    .optional(),
  /** ISO timestamp for optimistic locking — prevents concurrent edit conflicts. */
  updatedAt: z.string().optional(),
});

export type DealerOverrideInput = z.infer<typeof dealerOverrideSchema>;

/**
 * OPH-5: Order Review validation schemas.
 */

/** Address sub-schema for review data. */
const canonicalAddressSchema = z.object({
  company: z.string().nullable(),
  street: z.string().nullable(),
  city: z.string().nullable(),
  postal_code: z.string().nullable(),
  country: z.string().nullable(),
});

/** Line item sub-schema for review data. */
const canonicalLineItemSchema = z.object({
  position: z.number().int().min(1),
  article_number: z.string().nullable(),
  description: z.string(),  // Allow empty during editing; approval validates min. 1 non-empty
  quantity: z.number().min(0, "Menge muss mindestens 0 sein."),
  unit: z.string().nullable(),
  unit_price: z.number().nullable(),
  total_price: z.number().nullable(),
  currency: z.string().nullable(),
});

/** Sender sub-schema for extraction/review data. */
const canonicalSenderSchema = z.object({
  company_name: z.string().nullable(),
  street: z.string().nullable(),
  city: z.string().nullable(),
  postal_code: z.string().nullable(),
  country: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  customer_number: z.string().nullable(),
});

/** Schema for the order part of reviewed_data. */
const canonicalOrderSchema = z.object({
  order_number: z.string().nullable(),
  order_date: z.string().nullable(),
  dealer: z.object({
    id: z.string().nullable(),
    name: z.string().nullable(),
  }),
  sender: canonicalSenderSchema.nullable().optional(),
  delivery_address: canonicalAddressSchema.nullable(),
  billing_address: canonicalAddressSchema.nullable(),
  line_items: z.array(canonicalLineItemSchema),
  total_amount: z.number().nullable(),
  currency: z.string().nullable(),
  notes: z.string().nullable(),
});

/** PATCH /api/orders/[orderId]/review — auto-save reviewed data. */
export const reviewSaveSchema = z.object({
  reviewedData: z.object({
    order: canonicalOrderSchema,
    extraction_metadata: z.object({
      schema_version: z.string(),
      confidence_score: z.number(),
      model: z.string(),
      extracted_at: z.string(),
      source_files: z.array(z.string()),
      dealer_hints_applied: z.boolean(),
      column_mapping_applied: z.boolean().optional().default(false),
      input_tokens: z.number(),
      output_tokens: z.number(),
    }),
  }),
  /** ISO timestamp for optimistic locking. */
  updatedAt: z.string().optional(),
});

/** POST /api/orders/[orderId]/approve — approve/release order. */
export const reviewApproveSchema = z.object({
  /** ISO timestamp for optimistic locking. */
  updatedAt: z.string().optional(),
});

export type ReviewSaveInput = z.infer<typeof reviewSaveSchema>;
export type ReviewApproveInput = z.infer<typeof reviewApproveSchema>;

/**
 * OPH-6: Export validation schemas.
 */

export const exportFormatSchema = z.enum(["csv", "xml", "json"], {
  message: "Ungueltiges Format. Erlaubt: csv, xml, json",
});

export type ExportFormatInput = z.infer<typeof exportFormatSchema>;

/**
 * OPH-14: Dealer Data Mapping validation schemas.
 */

export const createMappingSchema = z.object({
  dealerId: z.string().uuid("Ungueltige Haendler-ID."),
  mappingType: z.enum(["article_number", "unit_conversion", "field_label"], {
    message: "Ungueltiger Mapping-Typ.",
  }),
  dealerValue: z
    .string()
    .min(1, "Haendler-Wert ist erforderlich.")
    .max(200, "Haendler-Wert darf maximal 200 Zeichen lang sein.")
    .trim(),
  erpValue: z
    .string()
    .min(1, "ERP-Wert ist erforderlich.")
    .max(200, "ERP-Wert darf maximal 200 Zeichen lang sein.")
    .trim(),
  conversionFactor: z
    .number()
    .positive("Umrechnungsfaktor muss positiv sein.")
    .optional(),
  description: z
    .string()
    .max(500, "Beschreibung darf maximal 500 Zeichen lang sein.")
    .optional(),
});

export const updateMappingSchema = z.object({
  dealerValue: z
    .string()
    .min(1, "Haendler-Wert ist erforderlich.")
    .max(200, "Haendler-Wert darf maximal 200 Zeichen lang sein.")
    .trim()
    .optional(),
  erpValue: z
    .string()
    .min(1, "ERP-Wert ist erforderlich.")
    .max(200, "ERP-Wert darf maximal 200 Zeichen lang sein.")
    .trim()
    .optional(),
  conversionFactor: z
    .number()
    .positive("Umrechnungsfaktor muss positiv sein.")
    .nullable()
    .optional(),
  description: z
    .string()
    .max(500, "Beschreibung darf maximal 500 Zeichen lang sein.")
    .nullable()
    .optional(),
  active: z.boolean().optional(),
});

export type CreateMappingInput = z.infer<typeof createMappingSchema>;
export type UpdateMappingInput = z.infer<typeof updateMappingSchema>;

/**
 * OPH-7: Admin Dealer Management validation schemas.
 */

/**
 * Strips XML-style system/instruction tags that could be used for prompt injection.
 * Only platform_admin users write hints, but defense-in-depth is good practice.
 */
const sanitizeHints = (text: string): string =>
  text
    .replace(/<\/?system[^>]*>/gi, "")
    .replace(/<\/?instructions?[^>]*>/gi, "")
    .replace(/<\|[^|]*\|>/g, "");

/** Extraction hints field with sanitization against prompt injection. */
const extractionHintsField = z
  .string()
  .max(5000, "Extraktions-Hints duerfen maximal 5000 Zeichen lang sein.")
  .transform(sanitizeHints)
  .nullable()
  .optional();

/** Validates regex patterns are syntactically correct. */
const regexPatternArray = z
  .array(z.string().max(500))
  .max(50, "Maximal 50 Eintraege erlaubt.")
  .refine(
    (patterns) =>
      patterns.every((p) => {
        try { new RegExp(p); return true; } catch { return false; }
      }),
    { message: "Enthaelt ungueltige Regex-Pattern." }
  );

export const createDealerSchema = z.object({
  name: z
    .string()
    .min(1, "Name ist erforderlich.")
    .max(200, "Name darf maximal 200 Zeichen lang sein.")
    .trim(),
  description: z
    .string()
    .max(2000, "Beschreibung darf maximal 2000 Zeichen lang sein.")
    .nullable()
    .optional(),
  format_type: z.enum(["email_text", "pdf_table", "excel", "mixed"], {
    message: "Ungueltiger Format-Typ.",
  }),
  street: z.string().max(200).nullable().optional(),
  postal_code: z.string().max(20).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  country: z.string().max(10).nullable().optional(),
  known_domains: z.array(z.string().max(200)).max(50).default([]),
  known_sender_addresses: z.array(z.string().max(200)).max(50).default([]),
  subject_patterns: regexPatternArray.default([]),
  filename_patterns: regexPatternArray.default([]),
  extraction_hints: extractionHintsField,
  active: z.boolean().default(true),
});

export const updateDealerSchema = z.object({
  name: z
    .string()
    .min(1, "Name ist erforderlich.")
    .max(200, "Name darf maximal 200 Zeichen lang sein.")
    .trim()
    .optional(),
  description: z
    .string()
    .max(2000, "Beschreibung darf maximal 2000 Zeichen lang sein.")
    .nullable()
    .optional(),
  format_type: z.enum(["email_text", "pdf_table", "excel", "mixed"], {
    message: "Ungueltiger Format-Typ.",
  }).optional(),
  street: z.string().max(200).nullable().optional(),
  postal_code: z.string().max(20).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  country: z.string().max(10).nullable().optional(),
  known_domains: z.array(z.string().max(200)).max(50).optional(),
  known_sender_addresses: z.array(z.string().max(200)).max(50).optional(),
  subject_patterns: regexPatternArray.optional(),
  filename_patterns: regexPatternArray.optional(),
  extraction_hints: extractionHintsField,
  active: z.boolean().optional(),
});

export type CreateDealerInput = z.infer<typeof createDealerSchema>;
export type UpdateDealerInput = z.infer<typeof updateDealerSchema>;

/**
 * OPH-8: Admin Tenant Management validation schemas.
 */

/** Slug must be lowercase letters, numbers, and hyphens only. */
const slugField = z
  .string()
  .min(2, "Slug muss mindestens 2 Zeichen lang sein.")
  .max(50, "Slug darf maximal 50 Zeichen lang sein.")
  .regex(
    /^[a-z0-9-]+$/,
    "Slug darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten."
  );

/** OPH-17: Single domain validation (no @, no spaces, must contain a dot). */
const emailDomainField = z
  .string()
  .min(3, "Domain muss mindestens 3 Zeichen lang sein.")
  .max(253, "Domain darf maximal 253 Zeichen lang sein.")
  .transform((d) => d.toLowerCase())
  .pipe(
    z
      .string()
      .regex(
        /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/,
        "Ungueltige Domain. Bitte nur die Domain eingeben, z.B. example.de — ohne @."
      )
      .refine((d) => d.includes("."), {
        message: "Domain muss mindestens einen Punkt enthalten (z.B. example.de).",
      })
      .refine((d) => !d.includes(".."), {
        message: "Domain darf keine aufeinanderfolgenden Punkte enthalten.",
      })
  );

/** OPH-17: Allowed email domains array — max 10, deduplicated, stored lowercase. */
const allowedEmailDomainsField = z
  .array(emailDomainField)
  .max(10, "Maximal 10 Domains pro Mandant.")
  .transform((domains) => {
    // Deduplicate case-insensitively and store lowercase
    const seen = new Set<string>();
    return domains
      .map((d) => d.toLowerCase())
      .filter((d) => {
        if (seen.has(d)) return false;
        seen.add(d);
        return true;
      });
  })
  .default([]);

export const createTenantSchema = z.object({
  name: z
    .string()
    .min(1, "Name ist erforderlich.")
    .max(200, "Name darf maximal 200 Zeichen lang sein.")
    .trim(),
  slug: slugField,
  contact_email: z
    .string()
    .min(1, "Kontakt-E-Mail ist erforderlich.")
    .email("Bitte geben Sie eine gueltige E-Mail-Adresse ein."),
  erp_type: z.enum(["SAP", "Dynamics365", "Sage", "Custom"], {
    message: "Bitte waehlen Sie einen gueltigen ERP-Typ.",
  }),
  status: z.enum(["active", "inactive", "trial"], {
    message: "Ungueltiger Status.",
  }).default("active"),
  allowed_email_domains: allowedEmailDomainsField,
});

export const updateTenantSchema = z.object({
  name: z
    .string()
    .min(1, "Name ist erforderlich.")
    .max(200, "Name darf maximal 200 Zeichen lang sein.")
    .trim()
    .optional(),
  contact_email: z
    .string()
    .min(1, "Kontakt-E-Mail ist erforderlich.")
    .email("Bitte geben Sie eine gueltige E-Mail-Adresse ein.")
    .optional(),
  erp_type: z.enum(["SAP", "Dynamics365", "Sage", "Custom"], {
    message: "Bitte waehlen Sie einen gueltigen ERP-Typ.",
  }).optional(),
  status: z.enum(["active", "inactive", "trial"], {
    message: "Ungueltiger Status.",
  }).optional(),
  allowed_email_domains: allowedEmailDomainsField.optional(),
});

/** Invite user on behalf of a specific tenant (platform admin). */
export const adminInviteUserSchema = z.object({
  email: z
    .string()
    .min(1, "E-Mail-Adresse ist erforderlich.")
    .email("Bitte geben Sie eine gueltige E-Mail-Adresse ein."),
  role: z.enum(["tenant_user", "tenant_admin"], {
    message: "Bitte waehlen Sie eine gueltige Rolle.",
  }),
});

export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type AdminInviteUserInput = z.infer<typeof adminInviteUserSchema>;

/**
 * OPH-15: Dealer Column Mapping validation schemas.
 */

const columnMappingEntrySchema = z.object({
  match_type: z.enum(["position", "header", "both"], {
    message: "Ungueltiger Match-Typ.",
  }),
  position: z
    .number()
    .int()
    .min(1, "Position muss mindestens 1 sein.")
    .max(100, "Position darf maximal 100 sein.")
    .nullable(),
  header_text: z
    .string()
    .max(200, "Header-Text darf maximal 200 Zeichen lang sein.")
    .nullable(),
  target_field: z
    .string()
    .min(1, "Zielfeld ist erforderlich.")
    .max(200, "Zielfeld darf maximal 200 Zeichen lang sein.")
    .trim(),
}).refine(
  (entry) => {
    if (entry.match_type === "position" || entry.match_type === "both") {
      return entry.position !== null;
    }
    return true;
  },
  { message: "Position ist erforderlich fuer diesen Match-Typ.", path: ["position"] }
).refine(
  (entry) => {
    if (entry.match_type === "header" || entry.match_type === "both") {
      return entry.header_text !== null && entry.header_text.trim().length > 0;
    }
    return true;
  },
  { message: "Header-Text ist erforderlich fuer diesen Match-Typ.", path: ["header_text"] }
);

export const columnMappingProfileSchema = z.object({
  mappings: z
    .array(columnMappingEntrySchema)
    .min(1, "Mindestens eine Spalten-Zuordnung ist erforderlich.")
    .max(50, "Maximal 50 Spalten-Zuordnungen erlaubt.")
    .refine(
      (mappings) => {
        const targets = mappings.map((m) => m.target_field.toLowerCase());
        return new Set(targets).size === targets.length;
      },
      { message: "Doppelte Zielfelder sind nicht erlaubt." }
    ),
});

export type ColumnMappingEntryInput = z.infer<typeof columnMappingEntrySchema>;
export type ColumnMappingProfileInput = z.infer<typeof columnMappingProfileSchema>;

/**
 * OPH-9: Admin ERP-Mapping-Konfiguration validation schemas.
 */

const erpTransformationStepSchema = z.object({
  type: z.enum(
    ["to_uppercase", "to_lowercase", "trim", "round", "multiply", "date_format", "default"],
    { message: "Ungueltiger Transformationstyp." }
  ),
  param: z.string().max(200, "Parameter darf maximal 200 Zeichen lang sein.").optional(),
}).refine(
  (step) => {
    // Parameterized transforms require a param
    if (["round", "multiply", "date_format", "default"].includes(step.type)) {
      return step.param !== undefined && step.param.trim().length > 0;
    }
    return true;
  },
  { message: "Dieser Transformationstyp benoetigt einen Parameter.", path: ["param"] }
);

const erpColumnMappingExtendedSchema = z.object({
  source_field: z
    .string()
    .min(1, "Quellfeld ist erforderlich.")
    .max(200, "Quellfeld darf maximal 200 Zeichen lang sein.")
    .trim(),
  target_column_name: z
    .string()
    .min(1, "Ausgabe-Spaltenname ist erforderlich.")
    .max(200, "Ausgabe-Spaltenname darf maximal 200 Zeichen lang sein.")
    .trim(),
  required: z.boolean().default(false),
  transformations: z
    .array(erpTransformationStepSchema)
    .max(10, "Maximal 10 Transformationen pro Spalte.")
    .default([]),
});

export const erpConfigSaveSchema = z.object({
  format: z.enum(["csv", "xml", "json"], {
    message: "Ungueltiges Format. Erlaubt: csv, xml, json",
  }),
  column_mappings: z
    .array(erpColumnMappingExtendedSchema)
    .max(100, "Maximal 100 Spalten-Zuordnungen erlaubt.")
    .default([]),
  separator: z.string().max(5).default(";"),
  quote_char: z.string().max(5).default('"'),
  encoding: z.enum(["utf-8", "latin-1", "windows-1252"], {
    message: "Ungueltiger Zeichensatz.",
  }).default("utf-8"),
  line_ending: z.enum(["LF", "CRLF"], {
    message: "Ungueltiges Zeilenende.",
  }).default("LF"),
  decimal_separator: z.enum([".", ","], {
    message: "Ungueltiges Dezimaltrennzeichen.",
  }).default("."),
  fallback_mode: z.enum(["block", "fallback_csv"], {
    message: "Ungueltiger Fallback-Modus.",
  }).default("block"),
  xml_template: z
    .string()
    .max(50000, "XML-Template darf maximal 50000 Zeichen lang sein.")
    .nullable()
    .default(null),
  comment: z
    .string()
    .max(500, "Kommentar darf maximal 500 Zeichen lang sein.")
    .optional(),
});

export const erpConfigTestSchema = z.object({
  /** Either a raw JSON string or an order ID to test against. */
  mode: z.enum(["json", "order"], {
    message: "Ungueltiger Testmodus.",
  }),
  /** Raw canonical JSON for mode=json. */
  jsonInput: z.string().max(100000).optional(),
  /** Order ID for mode=order. */
  orderId: z.string().uuid("Ungueltige Bestell-ID.").optional(),
  /** The config to test (same shape as save payload, minus comment). */
  config: erpConfigSaveSchema.omit({ comment: true }),
}).refine(
  (data) => {
    if (data.mode === "json") return !!data.jsonInput?.trim();
    if (data.mode === "order") return !!data.orderId;
    return false;
  },
  { message: "Bitte geben Sie entweder JSON-Daten oder eine Bestellung an.", path: ["jsonInput"] }
);

export type ErpConfigSaveInput = z.infer<typeof erpConfigSaveSchema>;
export type ErpConfigTestInput = z.infer<typeof erpConfigTestSchema>;
export type ErpTransformationStepInput = z.infer<typeof erpTransformationStepSchema>;
export type ErpColumnMappingExtendedInput = z.infer<typeof erpColumnMappingExtendedSchema>;

/**
 * OPH-10: Email Quarantine validation schemas.
 */

export const quarantineActionSchema = z.object({
  action: z.enum(["approved", "rejected"], {
    message: "Ungueltige Aktion. Erlaubt: approved, rejected",
  }),
});

export type QuarantineActionInput = z.infer<typeof quarantineActionSchema>;
