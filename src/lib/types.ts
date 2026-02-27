/**
 * Shared TypeScript types for OPH-1: Multi-Tenant Auth & RBAC.
 */

export type UserRole = "tenant_user" | "tenant_admin" | "platform_admin";
export type UserStatus = "active" | "inactive";
export type TenantStatus = "active" | "inactive" | "trial";
export type ErpType = "SAP" | "Dynamics365" | "Sage" | "Custom";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  erp_type: ErpType;
  contact_email: string;
  email_notifications_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  tenant_id: string;
  role: UserRole;
  first_name: string;
  last_name: string;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

/**
 * Enriched user profile with tenant and auth data,
 * used for display in the frontend.
 */
export interface TeamMember {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  status: UserStatus;
  last_sign_in_at: string | null;
}

/**
 * JWT app_metadata shape injected by custom_access_token_hook.
 */
export interface AppMetadata {
  tenant_id: string;
  role: UserRole;
  user_status: UserStatus;
  tenant_status: TenantStatus;
}

/**
 * Standard API response shape.
 */
export interface ApiResponse<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
}
