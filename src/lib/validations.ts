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
