/**
 * Shared TypeScript types for OPH-1: Multi-Tenant Auth & RBAC.
 */

export type UserRole = "tenant_user" | "tenant_admin" | "platform_admin" | "platform_viewer";
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
  /** OPH-35: Granular email notification settings. */
  email_confirmation_enabled: boolean;
  email_results_enabled: boolean;
  email_results_format: "standard_csv" | "tenant_format";
  email_results_confidence_enabled: boolean;
  email_postprocess_enabled: boolean;
  created_at: string;
  updated_at: string;
  /** OPH-16: Trial period start date. */
  trial_started_at: string | null;
  /** OPH-16: Trial period expiry date. */
  trial_expires_at: string | null;
  /** OPH-17: Allowed email domains for sender authorization. */
  allowed_email_domains: string[];
  /** OPH-12: Data retention period in days (30-365, default 90). */
  data_retention_days: number;
  /** OPH-29: Assigned ERP configuration ID (nullable). */
  erp_config_id: string | null;
  /** OPH-51: Public URL to tenant company logo in Supabase Storage. */
  logo_url: string | null;
  /** OPH-52: Billing model type. */
  billing_model: "pay-per-use" | "license-based" | "flat-rate" | null;
  /** OPH-52: One-time setup fee in EUR. */
  setup_fee: number | null;
  /** OPH-52: Recurring monthly fee in EUR. */
  monthly_fee: number | null;
  /** OPH-52: Cost per processed order in EUR. */
  cost_per_order: number | null;
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
  | "body_text_match"
  | "none";

export type DealerFormatType = "email_text" | "pdf_table" | "excel" | "mixed";

export interface Dealer {
  id: string;
  name: string;
  description: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
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
  city: string | null;
  country: string | null;
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
  dealer_street: string | null;
  dealer_postal_code: string | null;
  dealer_city: string | null;
  dealer_country: string | null;
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
  has_unmapped_articles: boolean;
  /** OPH-25: Email subject stored on the order (from Postmark, .eml parsing, or manual input). */
  subject: string | null;
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
  /** OPH-18: Tenant name for cross-tenant admin view. Null for non-admin responses. */
  tenant_name: string | null;
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
  /** OPH-37: Dealer's own internal article/product number (Lieferantenartikelnummer). */
  dealer_article_number: string | null;
  description: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  total_price: number | null;
  currency: string | null;
  /** OPH-40: How the article_number was determined. */
  article_number_source?: "extracted" | "catalog_match" | "manual" | null;
  /** OPH-40: Human-readable reason for catalog match (German). */
  article_number_match_reason?: string | null;
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
  /** OPH-47: How the customer_number was determined. */
  customer_number_source?: "catalog_email" | "catalog_exact" | "catalog_keyword" | "catalog_fuzzy_name" | "catalog_phone" | "extracted" | null;
  /** OPH-47: Human-readable reason for the customer number match (German). */
  customer_number_match_reason?: string | null;
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
  /** OPH-25: Email subject from the inbound email (Postmark, .eml, or manual input). */
  email_subject: string | null;
}

export interface ExtractionMetadata {
  schema_version: string;
  confidence_score: number;
  model: string;
  extracted_at: string;
  source_files: string[];
  dealer_hints_applied: boolean;
  column_mapping_applied: boolean;
  input_tokens: number;
  output_tokens: number;
  /** OPH-23: Number of chunks used for extraction (>1 = chunked large Excel). */
  chunks_used?: number;
}

export interface CanonicalOrderData {
  order: CanonicalOrder;
  extraction_metadata: ExtractionMetadata;
  /** OPH-20: ISO 639-1 code of the document's primary language (e.g. "DE", "EN"). Null/absent for old orders. */
  document_language?: string | null;
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
  required?: boolean;
}

/** OPH-29: Shared ERP export configuration. */
export interface ErpConfig {
  id: string;
  name: string;
  description: string | null;
  format: ExportFormat;
  column_mappings: ErpColumnMapping[];
  separator: string;
  quote_char: string;
  encoding: string;
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
  /** True if no tenant ERP config was found and default mappings are used. */
  usingDefaultConfig?: boolean;
  /** The tenant's default export format (from erp_configs where is_default = true). */
  tenantDefaultFormat?: ExportFormat;
  /** OPH-28: Confidence score for the output format, if configured. */
  confidenceScore?: ConfidenceScoreData;
}

/** Response metadata after an export download. */
export interface ExportDownloadResponse {
  orderId: string;
  format: ExportFormat;
  filename: string;
  exportedAt: string;
}

/**
 * OPH-14: Dealer Data Transformation types.
 */
export type MappingType = "article_number" | "unit_conversion" | "field_label";

export interface DealerDataMapping {
  id: string;
  dealer_id: string;
  tenant_id: string | null;
  mapping_type: MappingType;
  dealer_value: string;
  erp_value: string;
  conversion_factor: number | null;
  description: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Mapping with resolved dealer name and global flag for display. */
export interface DealerDataMappingListItem extends DealerDataMapping {
  dealer_name: string;
  is_global: boolean;
}

/**
 * OPH-8: Admin Tenant Management types.
 */

/** Tenant with usage stats for the admin list view. */
export interface TenantAdminListItem {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  erp_type: ErpType;
  contact_email: string;
  order_count: number;
  orders_last_month: number;
  last_upload_at: string | null;
  created_at: string;
  /** OPH-16: Trial period start date. */
  trial_started_at: string | null;
  /** OPH-16: Trial period expiry date. */
  trial_expires_at: string | null;
  /** OPH-17: Allowed email domains for sender authorization. */
  allowed_email_domains: string[];
  /** OPH-29: Assigned ERP config ID. */
  erp_config_id: string | null;
  /** OPH-29: Assigned ERP config name (for display). */
  erp_config_name: string | null;
  /** OPH-50: Count of distinct dealers that sent recognized orders to this tenant. */
  dealer_count: number;
  /** OPH-51: Public URL to tenant company logo. */
  logo_url: string | null;
  /** OPH-52: Billing model type. */
  billing_model: "pay-per-use" | "license-based" | "flat-rate" | null;
  /** OPH-52: One-time setup fee in EUR. */
  setup_fee: number | null;
  /** OPH-52: Recurring monthly fee in EUR. */
  monthly_fee: number | null;
  /** OPH-52: Cost per processed order in EUR. */
  cost_per_order: number | null;
}

/** User belonging to a tenant, shown in the admin user tab. */
export interface TenantUserListItem {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  status: UserStatus;
  last_sign_in_at: string | null;
  /** OPH-38: Whether the user has confirmed their email (null = not confirmed / pending invite). */
  email_confirmed_at: string | null;
  /** OPH-38: When the user was created / invited. */
  created_at: string | null;
}

/**
 * OPH-7: Admin Dealer Management types.
 */

/** Dealer with order stats for the admin list view. */
export interface DealerAdminListItem {
  id: string;
  name: string;
  description: string | null;
  format_type: DealerFormatType;
  city: string | null;
  country: string | null;
  active: boolean;
  order_count: number;
  last_order_at: string | null;
  created_at: string;
}

/** Tenant usage info for admin dealer view: which tenants this dealer sends orders to. */
export interface DealerTenantUsage {
  tenant_id: string;
  tenant_name: string;
  order_count: number;
  last_order_at: string | null;
}

/** Audit log action types. */
export type DealerAuditAction = "created" | "updated" | "deactivated" | "reactivated";

/** Single audit log entry for a dealer change. */
export interface DealerAuditLogEntry {
  id: string;
  dealer_id: string;
  changed_by: string;
  admin_email: string;
  action: DealerAuditAction;
  changed_fields: Record<string, { old: unknown; new: unknown }> | null;
  snapshot_before: Record<string, unknown> | null;
  created_at: string;
}

/** Conflict warning returned when dealer rules overlap. */
export interface DealerRuleConflict {
  field: string;
  value: string;
  conflicting_dealer_id: string;
  conflicting_dealer_name: string;
}

/**
 * OPH-15: Dealer Column Mapping for Extraction types.
 */

export type ColumnMappingMatchType = "position" | "header" | "both";

/** Format types that support column mapping (excludes "mixed"). */
export type ColumnMappingFormatType = "pdf_table" | "excel" | "email_text";

/** A single column-to-field mapping entry. */
export interface ColumnMappingEntry {
  match_type: ColumnMappingMatchType;
  position: number | null;
  header_text: string | null;
  target_field: string;
}

/** A column mapping profile for a specific dealer + format type. */
export interface ColumnMappingProfile {
  id: string;
  dealer_id: string;
  format_type: ColumnMappingFormatType;
  mappings: ColumnMappingEntry[];
  created_at: string;
  updated_at: string;
}

/** Test recognition result (no persistence). */
export interface TestRecognitionResult {
  dealer_id: string | null;
  dealer_name: string | null;
  recognition_method: RecognitionMethod;
  recognition_confidence: number;
}

/**
 * OPH-9: Admin ERP-Mapping-Konfiguration types.
 */

export type ErpEncoding = "utf-8" | "latin-1" | "windows-1252";
export type ErpDecimalSeparator = "." | ",";
export type ErpLineEnding = "LF" | "CRLF";
export type ErpFallbackMode = "block" | "fallback_csv";

/** Transformation step on an ERP column mapping. */
export interface ErpTransformationStep {
  type: "to_uppercase" | "to_lowercase" | "trim" | "round" | "multiply" | "date_format" | "default";
  /** Parameter for parameterized transforms: n for round/multiply, pattern for date_format, value for default. */
  param?: string;
}

/** Extended column mapping with transformations and required flag. */
export interface ErpColumnMappingExtended {
  source_field: string;
  target_column_name: string;
  required: boolean;
  transformations: ErpTransformationStep[];
}

/** OPH-29: Full ERP config as used in the admin UI. */
export interface ErpConfigAdmin {
  id: string;
  name: string;
  description: string | null;
  format: ExportFormat;
  column_mappings: ErpColumnMappingExtended[];
  separator: string;
  quote_char: string;
  encoding: ErpEncoding;
  line_ending: ErpLineEnding;
  decimal_separator: ErpDecimalSeparator;
  fallback_mode: ErpFallbackMode;
  xml_template: string | null;
  created_at: string;
  updated_at: string;
}

/** Version snapshot for an ERP config. */
export interface ErpConfigVersion {
  id: string;
  erp_config_id: string;
  version_number: number;
  snapshot: Record<string, unknown>;
  comment: string | null;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
}

/** OPH-29: Named ERP config for the list view. */
export interface ErpConfigListItem {
  id: string;
  name: string;
  description: string | null;
  format: ExportFormat;
  fallback_mode: ErpFallbackMode;
  assigned_tenant_count: number;
  version_count: number;
  last_updated: string;
}

/** OPH-29: Full config data returned from GET /api/admin/erp-configs/[configId]. */
export interface ErpConfigDetail {
  config: ErpConfigAdmin;
  versions: ErpConfigVersion[];
  assigned_tenants: { id: string; name: string }[];
}

/** Test result from the ERP config test endpoint. */
export interface ErpConfigTestResult {
  output: string;
  warnings: string[];
  format: ExportFormat;
}

/** OPH-29: Payload for saving an ERP config. */
export interface ErpConfigSavePayload {
  name: string;
  description?: string | null;
  format: ExportFormat;
  column_mappings: ErpColumnMappingExtended[];
  separator: string;
  quote_char: string;
  encoding: ErpEncoding;
  line_ending: ErpLineEnding;
  decimal_separator: ErpDecimalSeparator;
  fallback_mode: ErpFallbackMode;
  xml_template: string | null;
  comment?: string;
}

/**
 * OPH-10: Email Ingestion types.
 */

export type OrderSource = "web_upload" | "email_inbound";
export type QuarantineReviewStatus = "pending" | "approved" | "rejected";

/** Quarantined email entry for admin review. */
export interface EmailQuarantineEntry {
  id: string;
  tenant_id: string;
  sender_email: string;
  sender_name: string | null;
  subject: string | null;
  message_id: string | null;
  received_at: string;
  storage_path: string | null;
  review_status: QuarantineReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  order_id: string | null;
  created_at: string;
}

/** Quarantine list item with tenant name for admin display. */
export interface EmailQuarantineListItem extends EmailQuarantineEntry {
  tenant_name: string;
}

/** Response from GET /api/settings/inbound-email. */
export interface InboundEmailSettingsResponse {
  inboundEmailAddress: string | null;
}

/**
 * OPH-16: Trial / Demo Mode types.
 */

/** Response from GET /api/orders/preview/[token]. */
export interface OrderPreviewData {
  orderId: string;
  orderNumber: string | null;
  orderDate: string | null;
  dealerName: string | null;
  senderCompany: string | null;
  deliveryAddress: CanonicalAddress | null;
  lineItems: CanonicalLineItem[];
  totalAmount: number | null;
  currency: string | null;
  notes: string | null;
  extractedAt: string | null;
}

/** API response shape for preview endpoint. */
export type OrderPreviewResponse =
  | { status: "ok"; data: OrderPreviewData }
  | { status: "expired"; message: string }
  | { status: "not_found"; message: string };

/** Response from POST /api/auth/check-trial -- trial tenant detection on login. */
export interface TrialCheckResponse {
  isTrial: boolean;
}

/**
 * OPH-11: Order History & Dashboard types.
 */

/** Paginated orders list response from GET /api/orders. */
export interface OrdersPageResponse {
  orders: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/** Dashboard stats from GET /api/orders/stats. */
export interface OrderDashboardStats {
  today: number;
  thisWeek: number;
  thisMonth: number;
  openOrders: number;
  errorRate7Days: number;
}

/** Filter state for the orders list. */
export interface OrdersFilterState {
  status: OrderStatus | "all";
  search: string;
  dateFrom: string;
  dateTo: string;
  page: number;
}

/**
 * OPH-12: DSGVO-Compliance & Datenaufbewahrung types.
 */

export type DeletionType = "manual" | "automatic";

/** Entry in the append-only data deletion audit log. */
export interface DataDeletionLogEntry {
  id: string;
  tenant_id: string;
  order_id: string;
  order_created_at: string | null;
  file_count: number;
  deleted_by: string | null;
  deletion_type: DeletionType;
  deleted_at: string;
}

/** Response from GET /api/settings/data-retention. */
export interface DataRetentionSettings {
  dataRetentionDays: number;
  /** OPH-35: Granular email notification settings (read-only for tenant users). */
  emailConfirmationEnabled: boolean;
  emailResultsEnabled: boolean;
  emailResultsFormat: "standard_csv" | "tenant_format";
  emailResultsConfidenceEnabled: boolean;
  emailPostprocessEnabled: boolean;
}

/** Response from DELETE /api/orders/[orderId]. */
export interface OrderDeleteResponse {
  orderId: string;
  filesDeleted: number;
  deletedAt: string;
}

/**
 * OPH-28: Output Format Sample Upload & Confidence Score types.
 */

export type OutputFormatFileType = "csv" | "xlsx" | "xml" | "json";
export type OutputFormatDataType = "text" | "number" | "date";

/** A single detected column/field from the sample file. */
export interface OutputFormatSchemaColumn {
  column_name: string;
  data_type: OutputFormatDataType;
  is_required: boolean;
}

/** OPH-32: A single field mapping from an output format column to canonical order data. */
export interface FieldMapping {
  target_field: string;
  variable_path: string;
  transformation_type: "none" | "date" | "number" | "prefix_suffix";
  transformation_options?: {
    format?: string;
    prefix?: string;
    suffix?: string;
  };
}

/** Stored output format record (can be per-tenant or per-config). */
export interface TenantOutputFormat {
  id: string;
  tenant_id: string | null;
  /** OPH-29: Output format linked to a shared ERP config. */
  erp_config_id: string | null;
  file_name: string;
  file_path: string;
  file_type: OutputFormatFileType;
  detected_schema: OutputFormatSchemaColumn[];
  column_count: number;
  required_column_count: number;
  uploaded_at: string;
  uploaded_by: string;
  /** OPH-30: XML structure tree for template generation (only for XML files). */
  xml_structure?: XmlStructureNode | null;
  /** OPH-32: User-defined field mappings from output columns to order data paths. */
  field_mappings?: FieldMapping[] | null;
}

/** Response from POST /api/admin/output-formats/[tenantId]/parse (preview before save). */
export interface OutputFormatParseResponse {
  file_name: string;
  file_type: OutputFormatFileType;
  detected_schema: OutputFormatSchemaColumn[];
  column_count: number;
  required_column_count: number;
  warnings: string[];
  /** OPH-30: Raw XML structure for template generation (only set for XML files). */
  xml_structure?: XmlStructureNode | null;
}

/** OPH-30: Represents a node in the parsed XML tree for template generation. */
export interface XmlStructureNode {
  /** Element tag name. */
  tag: string;
  /** XML attributes (key-value pairs). */
  attributes?: Record<string, string>;
  /** Child elements. */
  children?: XmlStructureNode[];
  /** Whether this node represents a repeating array of records. */
  is_array?: boolean;
  /** Text content (leaf nodes only). */
  text?: string;
}

/** Confidence score data included in the export preview response. */
export interface ConfidenceScoreData {
  /** Score 0-100, null if not calculable. */
  score: number | null;
  /** Missing required output columns (top 5). */
  missing_columns: string[];
  /** Total required columns in the output format. */
  total_required: number;
  /** Number of required columns that have data. */
  filled_required: number;
  /** True if ERP field mapping is not yet configured. */
  mapping_not_configured: boolean;
}

/**
 * OPH-39: Manufacturer Article Catalog types.
 */

/** A single article in the manufacturer's catalog (Artikelstamm). */
export interface ArticleCatalogItem {
  id: string;
  tenant_id: string;
  article_number: string;
  name: string;
  category: string | null;
  color: string | null;
  packaging: string | null;
  size1: string | null;
  size2: string | null;
  ref_no: string | null;
  gtin: string | null;
  keywords: string | null;
  created_at: string;
  updated_at: string;
}

/** Result summary from a bulk article import (CSV/Excel). */
export interface ArticleImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/** Paginated response for article catalog list. */
export interface ArticleCatalogPageResponse {
  articles: ArticleCatalogItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * OPH-46: Manufacturer Customer Catalog types.
 */

/** A single customer entry in the manufacturer's customer catalog. */
export interface CustomerCatalogItem {
  id: string;
  tenant_id: string;
  customer_number: string;
  company_name: string;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  keywords: string | null;
  /** OPH-49: Link to global dealer profile. NULL = manually created entry. */
  dealer_id: string | null;
  /** OPH-49: Free-text tenant-specific notes. */
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Result summary from a bulk customer import (CSV/Excel). */
export interface CustomerImportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/** Paginated response for customer catalog list. */
export interface CustomerCatalogPageResponse {
  customers: CustomerCatalogItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * OPH-45: AI-Assisted ERP Field Mapping types.
 */

/** A single AI-suggested mapping from a target column to a canonical field. */
export interface AutoMappingResult {
  target_column: string;
  canonical_field: string | null;
  confidence: number;
}

/**
 * OPH-53: Platform Admin KPI Dashboard types.
 */

/** Line distribution histogram buckets. */
export interface LineDistribution {
  "1": number;
  "2": number;
  "3-5": number;
  "6-10": number;
  "11+": number;
}

/** Revenue breakdown for a single period. */
export interface RevenueBreakdown {
  total: number;
  transactionTurnover: number;
  monthlyFeeTurnover: number;
}

/** Full response from GET /api/admin/stats. */
export interface AdminDashboardStats {
  /** Activity KPIs (filtered by selected period). */
  orderCount: number;
  activeTenantCount: number;
  dealerCount: number;
  lineDistribution: LineDistribution;
  /** Revenue KPIs (always fixed, not period-filtered). */
  revenueCurrentMonth: RevenueBreakdown & { asOf: string };
  revenueLastMonth: RevenueBreakdown;
}
