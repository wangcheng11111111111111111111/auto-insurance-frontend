import type {
  AuthSessionResponse,
  AuthUser,
  AvailableType,
  ConversationMessage,
  IDCardInfo,
  InsurancePlan,
  PaymentResult,
  Policy,
  Quotation,
  SessionDetail,
  SessionInfo,
  TakeoverList,
  UnderwritingResult,
  VehicleInfo,
  AgentSessionList,
  BatchResult,
  RecentChatSession,
  ProviderFeatureStatus,
  WorkflowPhase,
  KnowledgeSource,
} from './types'
import { fileToBase64, sealPayload } from './clientCrypto'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

interface ApiError {
  detail: string
}

let accessToken = ''
let refreshPromise: Promise<AuthSessionResponse> | null = null
let chatOperationSignal: AbortSignal | null = null

export function setAccessToken(token: string) {
  accessToken = token
}

export function clearAccessToken() {
  accessToken = ''
}

export function setChatOperationSignal(signal: AbortSignal | null) {
  chatOperationSignal = signal
}

async function parseErrorResponse(resp: Response): Promise<Error> {
  let message = `HTTP ${resp.status}`
  try {
    const err = (await resp.json()) as ApiError
    if (err?.detail) message = err.detail
  } catch {
    // ignore
  }
  return new Error(message)
}

async function refreshAccessToken(): Promise<AuthSessionResponse> {
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    const resp = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
    if (!resp.ok) {
      accessToken = ''
      throw await parseErrorResponse(resp)
    }
    const result = (await resp.json()) as AuthSessionResponse
    accessToken = result.access_token
    return result
  })()
  try {
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  isFormData = false,
  retryOnUnauthorized = true,
): Promise<T> {
  const url = `${BASE_URL}${path}`
  const headers: Record<string, string> = {}

  if (!isFormData && options.body && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json'
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`
  }

  const operationSignal =
    options.signal ??
    (path.startsWith('/api/chat/') && options.method !== 'GET'
      ? (chatOperationSignal ?? undefined)
      : undefined)

  const resp = await fetch(url, {
    ...options,
    signal: operationSignal,
    credentials: 'include',
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
  })

  if (resp.status === 401 && retryOnUnauthorized && !path.startsWith('/api/auth/')) {
    await refreshAccessToken()
    return request<T>(path, options, isFormData, false)
  }

  if (!resp.ok) {
    throw await parseErrorResponse(resp)
  }

  if (resp.status === 204) return undefined as T
  return (await resp.json()) as T
}

async function requestBlob(path: string, retryOnUnauthorized = true): Promise<Blob> {
  const headers: Record<string, string> = {}
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: 'GET',
    credentials: 'include',
    headers,
  })
  if (resp.status === 401 && retryOnUnauthorized) {
    await refreshAccessToken()
    return requestBlob(path, false)
  }
  if (!resp.ok) {
    throw await parseErrorResponse(resp)
  }
  return resp.blob()
}

export async function authLogin(
  account: string,
  password: string,
  role: 'customer' | 'agent',
): Promise<AuthSessionResponse> {
  const encrypted_payload = await sealPayload({ account, password, role })
  const result = await request<AuthSessionResponse>(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ encrypted_payload }),
      headers: { 'Content-Type': 'application/json' },
    },
    false,
    false,
  )
  accessToken = result.access_token
  return result
}

export async function authRegister(payload: {
  role: 'customer' | 'agent'
  account: string
  name: string
  phone: string
  password: string
  agent_id?: string
  employee_no?: string
  department?: string
  invite_code?: string
}): Promise<AuthSessionResponse> {
  const encrypted_payload = await sealPayload({ ...payload })
  const result = await request<AuthSessionResponse>(
    '/api/auth/register',
    {
      method: 'POST',
      body: JSON.stringify({ encrypted_payload }),
      headers: { 'Content-Type': 'application/json' },
    },
    false,
    false,
  )
  accessToken = result.access_token
  return result
}

export async function authRefresh(): Promise<AuthSessionResponse> {
  return refreshAccessToken()
}

export async function authLogout(): Promise<void> {
  try {
    await request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }, false, false)
  } finally {
    accessToken = ''
  }
}

export async function authMe(): Promise<AuthUser> {
  const result = await get<{ success: boolean; user: AuthUser }>('/api/auth/me')
  return result.user
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function get<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' })
}

// ==================== 用户端 Chat API ====================

export async function chatInit(
  agentId: string,
  userId = '',
): Promise<{
  success: boolean
  session_id: string
  message: string
  available_types: AvailableType[]
}> {
  return post('/api/chat/init', { agent_id: agentId, user_id: userId })
}

export async function chatSelectType(
  sessionId: string,
  insuranceType: string,
): Promise<{
  success: boolean
  message: string
  phase: string
  session: SessionInfo
}> {
  return post('/api/chat/select-type', {
    session_id: sessionId,
    insurance_type: insuranceType,
  })
}

export async function chatMessage(
  sessionId: string,
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<{
  success: boolean
  action: string
  message: string
  trace: string[]
  phase: string
  vehicle?: VehicleInfo | null
  plan?: InsurancePlan | null
  quotation?: Quotation | null
  underwriting?: UnderwritingResult | null
  payment?: PaymentResult | null
  policy?: Policy | null
  last_year_plan?: InsurancePlan | null
  customer_type?: 'new' | 'returning'
  transferred_to_human?: boolean
  needs_verification?: boolean
  knowledge_sources?: KnowledgeSource[]
}> {
  const encrypted_payload = await sealPayload({ message, history })
  return post('/api/chat/message', {
    session_id: sessionId,
    encrypted_payload,
  })
}

export async function chatUploadVehicleLicense(
  sessionId: string,
  frontImage: File,
  backImage: File,
): Promise<{
  success: boolean
  message: string
  vehicle?: VehicleInfo
  phase: string
  transferred_to_human?: boolean
}> {
  const [front, back] = await Promise.all([fileToBase64(frontImage), fileToBase64(backImage)])
  const encrypted_payload = await sealPayload({
    front_image: front,
    back_image: back,
    front_type: frontImage.type,
    back_type: backImage.type,
  })
  return post('/api/chat/secure/upload-vehicle-license', {
    session_id: sessionId,
    encrypted_payload,
  })
}

export async function chatQueryByPlate(
  sessionId: string,
  plate: string,
  vin: string,
): Promise<{
  success: boolean
  message: string
  vehicle?: VehicleInfo
  last_year_plan?: InsurancePlan
  customer_type?: 'new' | 'returning'
  phase: string
  suggest_next?: string
}> {
  return post('/api/chat/query-by-plate', {
    session_id: sessionId,
    plate,
    vin,
  })
}

export async function chatRecommend(sessionId: string): Promise<{
  success: boolean
  message: string
  plan: InsurancePlan
  phase: string
  skip_recommendation?: boolean
}> {
  return post('/api/chat/recommend', { session_id: sessionId })
}

export async function chatUseLastYear(sessionId: string): Promise<{
  success: boolean
  message: string
  plan: InsurancePlan
  phase: string
}> {
  return post('/api/chat/use-last-year', { session_id: sessionId })
}

export async function chatModifyPlan(
  sessionId: string,
  userInput: string,
): Promise<{
  success: boolean
  message: string
  plan: InsurancePlan
  phase: string
}> {
  const encrypted_payload = await sealPayload({ user_input: userInput })
  return post('/api/chat/secure/modify-plan', {
    session_id: sessionId,
    encrypted_payload,
  })
}

export async function chatUploadIdCard(
  sessionId: string,
  frontImage: File,
  backImage: File,
): Promise<{
  success: boolean
  message: string
  id_card?: IDCardInfo
  phase: string
  transferred_to_human?: boolean
}> {
  const [front, back] = await Promise.all([fileToBase64(frontImage), fileToBase64(backImage)])
  const encrypted_payload = await sealPayload({
    front_image: front,
    back_image: back,
    front_type: frontImage.type,
    back_type: backImage.type,
  })
  return post('/api/chat/secure/upload-id-card', {
    session_id: sessionId,
    encrypted_payload,
  })
}

export async function chatGenerateQuotation(sessionId: string): Promise<{
  success: boolean
  message: string
  quotation: Quotation
  phase: string
  knowledge_sources?: KnowledgeSource[]
  validation_warnings?: string[]
}> {
  return post('/api/chat/generate-quotation', { session_id: sessionId })
}

export async function chatSubmitUnderwriting(sessionId: string): Promise<{
  success: boolean
  message: string
  underwriting: UnderwritingResult
  phase: string
  needs_verification?: boolean
  knowledge_sources?: KnowledgeSource[]
  validation_warnings?: string[]
}> {
  return post('/api/chat/submit-underwriting', { session_id: sessionId })
}

export async function chatSubmitVerification(
  sessionId: string,
  photo?: File,
  video?: File,
): Promise<{
  success: boolean
  message: string
  underwriting: UnderwritingResult
  phase: string
}> {
  const encrypted_payload = await sealPayload({
    photo: photo ? await fileToBase64(photo) : '',
    video: video ? await fileToBase64(video) : '',
    photo_type: photo?.type || '',
    video_type: video?.type || '',
  })
  return post('/api/chat/secure/submit-verification', {
    session_id: sessionId,
    encrypted_payload,
  })
}

export async function chatInitiatePayment(sessionId: string): Promise<{
  success: boolean
  message: string
  payment: PaymentResult
  phase: string
}> {
  return post('/api/chat/initiate-payment', { session_id: sessionId })
}

export async function chatVerifyPayment(sessionId: string): Promise<{
  success: boolean
  message: string
  payment?: PaymentResult
  policy?: Policy
  phase: string
}> {
  return post('/api/chat/verify-payment', { session_id: sessionId })
}

export async function chatRollbackWorkflow(
  sessionId: string,
  targetPhase: WorkflowPhase,
): Promise<{
  success: boolean
  message: string
  phase: WorkflowPhase
}> {
  return post('/api/chat/rollback', {
    session_id: sessionId,
    target_phase: targetPhase,
  })
}

export async function chatGetSession(sessionId: string): Promise<SessionDetail> {
  return get(`/api/chat/session/${sessionId}`)
}

export async function chatRecentSessions(
  limit = 10,
): Promise<{ success: boolean; sessions: RecentChatSession[] }> {
  return get(`/api/chat/sessions/recent?limit=${limit}`)
}

export async function chatProviderStatus(): Promise<ProviderFeatureStatus> {
  return get('/api/chat/provider-status')
}

export async function chatDeleteSession(
  sessionId: string,
): Promise<{ success: boolean; session_id: string }> {
  return request(`/api/chat/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
}

export async function chatBatchDeleteSessions(sessionIds: string[]): Promise<{
  success: boolean
  deleted: string[]
  skipped: string[]
  deleted_count: number
}> {
  return post('/api/chat/sessions/batch-delete', { session_ids: sessionIds })
}

export async function chatSessionMessages(
  sessionId: string,
  after = '',
): Promise<{
  success: boolean
  messages: ConversationMessage[]
  phase: string
  server_time: string
}> {
  const query = after ? `?after=${encodeURIComponent(after)}` : ''
  return get(`/api/chat/session/${sessionId}/messages${query}`)
}

export async function chatBatchQuery(agentId: string, plates: string[]): Promise<BatchResult> {
  return post('/api/chat/batch-query', { agent_id: agentId, plates })
}

// ==================== 业务员端 Agent API ====================

export async function agentInit(agentId: string): Promise<{
  success: boolean
  session_id: string
  message: string
  available_types: AvailableType[]
}> {
  return post('/api/agent/init', { agent_id: agentId })
}

export async function agentSelectType(
  sessionId: string,
  insuranceType: string,
): Promise<{
  success: boolean
  message: string
  phase: string
}> {
  return post('/api/agent/select-type', {
    session_id: sessionId,
    insurance_type: insuranceType,
  })
}

export async function agentListSessions(): Promise<AgentSessionList> {
  return get('/api/agent/sessions')
}

export async function agentExportSessionsReport(filters: {
  phase?: string
  takeoverStatus?: 'pending' | 'processing' | 'resolved' | 'all'
  keyword?: string
  hideEmpty?: boolean
}): Promise<Blob> {
  const params = new URLSearchParams({
    phase: filters.phase ?? 'all',
    takeover_status: filters.takeoverStatus ?? 'all',
    keyword: filters.keyword ?? '',
    hide_empty: String(filters.hideEmpty ?? false),
  })
  return requestBlob(`/api/agent/reports/sessions.xlsx?${params.toString()}`)
}

export async function agentGetSession(sessionId: string): Promise<SessionDetail> {
  return get(`/api/agent/session/${sessionId}`)
}

export async function agentSessionMessages(
  sessionId: string,
): Promise<{ success: boolean; messages: ConversationMessage[] }> {
  return get(`/api/agent/session/${sessionId}/messages`)
}

export async function agentSendSessionMessage(
  sessionId: string,
  content: string,
): Promise<{ success: boolean; message_item: ConversationMessage }> {
  return post(`/api/agent/session/${sessionId}/messages`, { content })
}

export async function agentManualVehicle(
  sessionId: string,
  payload: {
    license_plate: string
    vin: string
    brand_model: string
    owner_name: string
    registration_date: string
    use_type: string
    seat_count: number
    vehicle_type: string
    engine_number: string
  },
): Promise<{ success: boolean; message: string; vehicle: VehicleInfo; phase: string }> {
  return post(`/api/agent/session/${sessionId}/manual-vehicle`, payload)
}

export async function agentManualApplicant(
  sessionId: string,
  payload: { name: string; id_number: string },
): Promise<{ success: boolean; message: string; applicant: IDCardInfo; phase: string }> {
  return post(`/api/agent/session/${sessionId}/manual-applicant`, payload)
}

export async function agentBatchCreate(agentId: string, plates: string[]): Promise<BatchResult> {
  return post('/api/agent/batch/create', { agent_id: agentId, plates })
}

export async function agentBatchQuery(agentId: string, plates: string[]): Promise<BatchResult> {
  return post('/api/agent/batch/query', { agent_id: agentId, plates })
}

export async function agentPendingTakeovers(limit = 20): Promise<TakeoverList> {
  return get(`/api/agent/takeovers/pending?limit=${limit}`)
}

export async function agentTakeovers(
  status: 'pending' | 'processing' | 'resolved' | 'all' = 'pending',
  limit = 50,
): Promise<TakeoverList> {
  return get(`/api/agent/takeovers?status=${status}&limit=${limit}`)
}

export async function agentClaimTakeover(takeoverId: number): Promise<{
  success: boolean
  takeover: unknown
}> {
  return post(`/api/agent/takeovers/${takeoverId}/claim`)
}

export async function agentResolveTakeover(
  takeoverId: number,
  remark = '',
): Promise<{
  success: boolean
  takeover: unknown
}> {
  return post(`/api/agent/takeovers/${takeoverId}/resolve`, {
    handler_id: '',
    remark,
  })
}

export function agentNotificationStream(
  onMessage: (data: Record<string, unknown>) => void,
  onError?: (error: Error) => void,
): { close: () => void } {
  const controller = new AbortController()
  const run = async () => {
    while (!controller.signal.aborted) {
      try {
        let resp = await fetch(`${BASE_URL}/api/agent/notifications/stream?agent_id=`, {
          credentials: 'include',
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
          signal: controller.signal,
        })
        if (resp.status === 401) {
          await refreshAccessToken()
          resp = await fetch(`${BASE_URL}/api/agent/notifications/stream?agent_id=`, {
            credentials: 'include',
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: controller.signal,
          })
        }
        if (!resp.ok || !resp.body) throw await parseErrorResponse(resp)

        const reader = resp.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (!controller.signal.aborted) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const frames = buffer.split('\n\n')
          buffer = frames.pop() ?? ''
          for (const frame of frames) {
            const data = frame
              .split('\n')
              .filter((line) => line.startsWith('data:'))
              .map((line) => line.slice(5).trim())
              .join('\n')
            if (!data) continue
            try {
              onMessage(JSON.parse(data) as Record<string, unknown>)
            } catch {
              // Ignore malformed SSE data.
            }
          }
        }
      } catch (error) {
        if (controller.signal.aborted) break
        onError?.(error as Error)
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }
    }
  }
  void run()
  return { close: () => controller.abort() }
}
