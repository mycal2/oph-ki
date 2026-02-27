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
