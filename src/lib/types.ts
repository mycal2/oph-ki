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
export type OrderStatus = "uploaded" | "processing" | "extracted" | "review" | "approved" | "exported" | "error";

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
  | "ai_content"
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

/** Extended order with dealer recognition and extraction data for the detail page. */
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
  extraction_status: ExtractionStatus | null;
  extracted_data: CanonicalOrderData | null;
  extraction_error: string | null;
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
  extraction_status: ExtractionStatus | null;
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
  /** The order's actual updated_at after the override (for optimistic locking). */
  updatedAt: string;
}

/**
 * OPH-4: AI Extraction types.
 */
export type ExtractionStatus = "pending" | "processing" | "extracted" | "failed";

export interface CanonicalAddress {
  company: string | null;
  street: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
}

export interface CanonicalLineItem {
  position: number;
  article_number: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  total_price: number | null;
  currency: string | null;
}

export interface CanonicalSender {
  company_name: string | null;
  street: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  customer_number: string | null;
}

export interface CanonicalOrder {
  order_number: string | null;
  order_date: string | null;
  dealer: { id: string | null; name: string | null };
  sender: CanonicalSender | null;
  delivery_address: CanonicalAddress | null;
  billing_address: CanonicalAddress | null;
  line_items: CanonicalLineItem[];
  total_amount: number | null;
  currency: string | null;
  notes: string | null;
}

export interface ExtractionMetadata {
  schema_version: string;
  confidence_score: number;
  model: string;
  extracted_at: string;
  source_files: string[];
  dealer_hints_applied: boolean;
  input_tokens: number;
  output_tokens: number;
}

export interface CanonicalOrderData {
  order: CanonicalOrder;
  extraction_metadata: ExtractionMetadata;
}

/**
 * OPH-5: Order Review & Manual Correction types.
 */

/** Auto-save status indicator states. */
export type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

/** Response from PATCH /api/orders/[orderId]/review (auto-save). */
export interface ReviewSaveResponse {
  orderId: string;
  updatedAt: string;
}

/** Response from POST /api/orders/[orderId]/approve. */
export interface ReviewApproveResponse {
  orderId: string;
  status: OrderStatus;
  reviewedAt: string;
  reviewedBy: string;
}

/** Signed URL for a file preview. */
export interface FilePreviewUrl {
  fileId: string;
  filename: string;
  mimeType: string;
  signedUrl: string;
  expiresAt: string;
}

/** Response from GET /api/orders/[orderId]/preview-url. */
export interface PreviewUrlResponse {
  files: FilePreviewUrl[];
}

/** Extended order type for the review page (includes reviewed_data). */
export interface OrderForReview extends OrderWithDealer {
  reviewed_data: CanonicalOrderData | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  last_exported_at: string | null;
}

/**
 * OPH-6: ERP-Export & Download types.
 */

export type ExportFormat = "csv" | "xml" | "json";

/** Column mapping entry for ERP export configuration. */
export interface ErpColumnMapping {
  source_field: string;
  target_column_name: string;
}

/** ERP export configuration for a tenant. */
export interface ErpConfig {
  id: string;
  tenant_id: string;
  format: ExportFormat;
  column_mappings: ErpColumnMapping[];
  separator: string;
  quote_char: string;
  encoding: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

/** Export log entry (audit trail). */
export interface ExportLog {
  id: string;
  order_id: string;
  tenant_id: string;
  user_id: string;
  format: ExportFormat;
  filename: string;
  exported_at: string;
}

/** Response from GET /api/orders/[orderId]/export/preview. */
export interface ExportPreviewResponse {
  format: ExportFormat;
  /** Column headers for CSV format. */
  headers: string[];
  /** First 10 rows of data. */
  rows: string[][];
  /** Total number of rows. */
  totalRows: number;
  /** Filename that will be used for download. */
  filename: string;
  /** Raw preview content (for XML/JSON). */
  rawContent?: string;
}

/** Response metadata after an export download. */
export interface ExportDownloadResponse {
  orderId: string;
  format: ExportFormat;
  filename: string;
  exportedAt: string;
}
