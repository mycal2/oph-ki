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
