export type InsuranceType = 'car' | 'property' | 'life'
export type UserRole = 'customer' | 'agent'
export type WorkflowPhase =
  | 'insurance_type_selection'
  | 'collecting_info'
  | 'recommending'
  | 'identity_verification'
  | 'quoting'
  | 'underwriting'
  | 'payment'
  | 'completed'
  | 'transferred_to_human'
export type CustomerType = 'new' | 'returning'
export type UnderwritingStatus = 'pending' | 'approved' | 'rejected' | 'needs_verification'
export type PaymentStatus = 'pending' | 'processing' | 'success' | 'failed'

export interface AuthUser {
  id: string
  role: UserRole
  name: string
  account: string
  agent_id: string
  department: string
  employee_no: string
}

export interface AuthSessionResponse {
  success: boolean
  access_token: string
  token_type: 'bearer'
  expires_in: number
  refresh_expires_in: number
  user: AuthUser
}

export interface InsuranceItem {
  name: string
  code: string
  coverage_amount: string
  premium: string
  deductible: string
}

export interface InsuranceCompany {
  name: string
  code: string
  available_items: string[]
  discount_rate: string
}

export interface VehicleInfo {
  license_plate: string
  vin: string
  engine_number: string
  brand_model: string
  registration_date: string | null
  owner_name: string
  use_type: string
  seat_count: number
  vehicle_type: string
}

export interface IDCardInfo {
  name: string
  id_number: string
  gender: string
  ethnicity?: string
  birth_date?: string | null
  address: string
  issuing_authority?: string
  front_image_url: string
  back_image_url: string
}

export interface InsurancePlan {
  company: InsuranceCompany | null
  items: InsuranceItem[]
  total_premium: string
  discount_rate: string
  is_last_year_plan: boolean
}

export interface Quotation {
  quotation_id: string
  version: string
  total_premium?: string
  plan: InsurancePlan | null
  vehicle: VehicleInfo | null
  applicant: IDCardInfo | null
  insured: IDCardInfo | null
  effective_date: string | null
  expire_date: string | null
  created_at: string | null
  valid_until: string | null
  rate_source: string
  provider_reference: string
  request_digest: string
  raw_response?: string
  is_estimate: boolean
  status: string
  knowledge_sources?: KnowledgeSource[]
  validation_warnings?: string[]
}

export interface KnowledgeSource {
  type: 'scenario' | 'rule' | 'field' | 'followup' | 'template'
  sheet: string
  record_id: number | string | null
  title: string
  excerpt: string
  score?: number
}

export interface UnderwritingResult {
  status: UnderwritingStatus
  message: string
  requires_photo: boolean
  requires_video: boolean
  checked_at: string | null
  provider_reference: string
  request_digest: string
  raw_response?: string
  quote_version: string
  approved_amount: string
}

export interface PaymentResult {
  status: PaymentStatus
  transaction_id: string
  payment_url: string
  paid_amount: string
  paid_at: string | null
  quotation_id: string
  quote_version: string
  expected_amount: string
  provider_reference: string
  raw_response?: string
}

export interface Policy {
  policy_id: string
  policy_number: string
  applicant: IDCardInfo | null
  insured: IDCardInfo | null
  vehicle: VehicleInfo | null
  items_detail: InsuranceItem[]
  total_premium: string
  effective_date: string | null
  expire_date: string | null
  terms_and_conditions: string[]
  issued_at: string | null
}

export interface SessionInfo {
  session_id: string
  agent_id: string
  user_id: string
  role: UserRole
  license_plate: string
  insurance_type: InsuranceType
  phase: WorkflowPhase
  customer_type: CustomerType
}

export interface SessionDetail {
  success: boolean
  session: SessionInfo
  phase: WorkflowPhase
  plate: string
  vehicle: VehicleInfo | null
  applicant?: IDCardInfo | null
  plan: InsurancePlan | null
  quotation?: Quotation | null
  underwriting?: UnderwritingResult | null
  payment?: PaymentResult | null
  policy: Policy | null
  conversation_messages?: ConversationMessage[]
}

export interface RecentChatSession {
  session_id: string
  phase: WorkflowPhase
  plate: string
  plan_total?: string | null
  updated_at: string
  message_count: number
  last_message: string
}

export interface ProviderFeatureStatus {
  success: boolean
  provider_status: {
    quote: boolean
    underwriting: boolean
    payment: boolean
  }
  all_ready: boolean
  message: string
}

export interface ConversationMessage {
  id: string
  role: 'customer' | 'agent' | 'system' | 'assistant'
  content: string
  sender_id: string
  sender_name: string
  created_at: string
  metadata?: {
    knowledge_sources?: KnowledgeSource[]
  }
}

export interface AgentSessionSummary {
  session_id: string
  plate: string
  phase: WorkflowPhase
  plan_total: string | null
  updated_at?: string
  message_count?: number
  last_message?: string
}

export interface AgentSessionList {
  success: boolean
  agent_id: string
  total: number
  sessions: AgentSessionSummary[]
}

export interface TakeoverRecord {
  id: number
  transfer_id: string
  session_id: string
  reason: string
  source_phase: string
  handle_status: string
  handler_id: string
  handle_remark: string
  requested_at: string | null
  resolved_at: string | null
  waiting_seconds: number
  plate: string
  phase: string
}

export interface TakeoverList {
  success: boolean
  total: number
  status?: string
  counts?: {
    pending: number
    processing: number
    resolved: number
  }
  takeovers: TakeoverRecord[]
}

export interface BatchPlateResult {
  plate: string
  session_id: string | null
  phase?: string
  plan: InsurancePlan | null
  error?: string
}

export interface BatchResult {
  success: boolean
  agent_id: string
  results: BatchPlateResult[]
  total: number
}

export interface AvailableType {
  type: InsuranceType
  name: string
  available: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  structured?: MessageStructuredData
}

export interface ChatAttachment {
  label?: string
  name: string
  type: string
  size: number
  previewUrl: string
}

export interface MessageStructuredData {
  phase?: WorkflowPhase
  retry_text?: string
  vehicle?: VehicleInfo | null
  id_card?: IDCardInfo | null
  plan?: InsurancePlan | null
  quotation?: Quotation | null
  underwriting?: UnderwritingResult | null
  payment?: PaymentResult | null
  policy?: Policy | null
  last_year_plan?: InsurancePlan | null
  customer_type?: CustomerType
  transferred_to_human?: boolean
  needs_verification?: boolean
  suggest_next?: string
  attachments?: ChatAttachment[]
  knowledge_sources?: KnowledgeSource[]
}
