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

/**
 * OPH-2: Order Upload types.
 */
export type OrderStatus = "uploaded" | "processing" | "extracted" | "review" | "exported" | "error";

export interface Order {
  id: string;
  tenant_id: string;
  uploaded_by: string | null;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
}

export interface OrderFile {
  id: string;
  order_id: string;
  tenant_id: string;
  original_filename: string;
  storage_path: string;
  file_size_bytes: number;
  mime_type: string;
  sha256_hash: string;
  created_at: string;
}

/** Dealer recognition result embedded in the upload confirm response. */
export interface UploadDealerInfo {
  dealerId: string | null;
  dealerName: string | null;
  recognitionMethod: RecognitionMethod;
  recognitionConfidence: number;
}

export interface UploadOrderResponse {
  orderId: string;
  filename: string;
  isDuplicate: boolean;
  duplicateDate?: string;
  dealer: UploadDealerInfo;
}

/**
 * OPH-3: Dealer Recognition types.
 */
export type RecognitionMethod =
  | "domain"
  | "address"
  | "subject"
  | "filename"
  | "manual"
  | "none";

export type DealerFormatType = "email_text" | "pdf_table" | "excel";

export interface Dealer {
  id: string;
  name: string;
  known_domains: string[];
  known_sender_addresses: string[];
  subject_patterns: string[];
  filename_patterns: string[];
  format_type: DealerFormatType;
  extraction_hints: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

/** Lightweight dealer item for dropdown lists. */
export interface DealerListItem {
  id: string;
  name: string;
  format_type: DealerFormatType;
}

/** Dealer recognition result attached to an order. */
export interface OrderDealerInfo {
  dealer_id: string | null;
  dealer_name: string | null;
  recognition_method: RecognitionMethod;
  recognition_confidence: number;
  dealer_overridden_by: string | null;
  dealer_overridden_at: string | null;
  overridden_by_name: string | null;
}

/** Extended order with dealer recognition data for the detail page. */
export interface OrderWithDealer extends Order {
  dealer_id: string | null;
  dealer_name: string | null;
  recognition_method: RecognitionMethod;
  recognition_confidence: number;
  dealer_overridden_by: string | null;
  dealer_overridden_at: string | null;
  override_reason: string | null;
  overridden_by_name: string | null;
  uploaded_by_name: string | null;
  files: OrderFile[];
}

/** Lightweight order summary for the orders list page. */
export interface OrderListItem {
  id: string;
  status: OrderStatus;
  created_at: string;
  uploaded_by_name: string | null;
  dealer_name: string | null;
  recognition_method: RecognitionMethod;
  recognition_confidence: number;
  file_count: number;
  primary_filename: string | null;
}

/** Response from PATCH /api/orders/[orderId]/dealer */
export interface DealerOverrideResponse {
  orderId: string;
  dealerId: string;
  dealerName: string;
  overriddenBy: string;
  overriddenByName: string;
  overriddenAt: string;
  overrideReason: string | null;
}
