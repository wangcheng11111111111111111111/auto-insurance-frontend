import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  AvailableType,
  ChatMessage,
  IDCardInfo,
  InsurancePlan,
  MessageStructuredData,
  PaymentResult,
  Policy,
  Quotation,
  SessionInfo,
  SessionDetail,
  UnderwritingResult,
  VehicleInfo,
  WorkflowPhase,
} from '../api/types'
import { PHASE_ORDER } from '../constants'

let messageSeq = 0
function makeId() {
  messageSeq += 1
  return `msg_${Date.now()}_${messageSeq}`
}

export const useSessionStore = defineStore('session', () => {
  const sessionId = ref('')
  const agentId = ref('')
  const userId = ref('')
  const phase = ref<WorkflowPhase>('insurance_type_selection')
  const licensePlate = ref('')
  const customerType = ref<'new' | 'returning' | ''>('')

  const vehicle = ref<VehicleInfo | null>(null)
  const applicant = ref<IDCardInfo | null>(null)
  const plan = ref<InsurancePlan | null>(null)
  const quotation = ref<Quotation | null>(null)
  const underwriting = ref<UnderwritingResult | null>(null)
  const payment = ref<PaymentResult | null>(null)
  const policy = ref<Policy | null>(null)

  const messages = ref<ChatMessage[]>([])
  const availableTypes = ref<AvailableType[]>([])

  const isCompleted = computed(() => phase.value === 'completed')
  const isAgent = computed(() => agentId.value !== '')

  const currentPhaseIndex = computed(() => {
    const idx = PHASE_ORDER.indexOf(phase.value)
    return idx === -1 ? 0 : idx
  })

  function addUserMessage(content: string, structured?: MessageStructuredData) {
    messages.value.push({
      id: makeId(),
      role: 'user',
      content,
      timestamp: Date.now(),
      structured,
    })
  }

  function addAssistantMessage(content: string, structured?: MessageStructuredData) {
    messages.value.push({
      id: makeId(),
      role: 'assistant',
      content,
      timestamp: Date.now(),
      structured,
    })
    if (structured?.phase) {
      phase.value = structured.phase
    }
  }

  function addSystemMessage(content: string) {
    messages.value.push({
      id: makeId(),
      role: 'system',
      content,
      timestamp: Date.now(),
    })
  }

  function removeMessage(messageId: string) {
    messages.value = messages.value.filter((message) => message.id !== messageId)
  }

  function setSession(sid: string, aid: string, uid = '', types?: AvailableType[]) {
    sessionId.value = sid
    agentId.value = aid
    userId.value = uid
    if (types) availableTypes.value = types
    messages.value = []
    phase.value = 'insurance_type_selection'
    vehicle.value = null
    applicant.value = null
    plan.value = null
    quotation.value = null
    underwriting.value = null
    payment.value = null
    policy.value = null
    licensePlate.value = ''
    customerType.value = ''
  }

  function restoreSession(detail: SessionDetail) {
    sessionId.value = detail.session.session_id
    agentId.value = detail.session.agent_id
    userId.value = detail.session.user_id
    phase.value = detail.phase
    licensePlate.value = detail.plate
    customerType.value = detail.session.customer_type
    vehicle.value = detail.vehicle
    applicant.value = detail.applicant ?? null
    plan.value = detail.plan
    quotation.value = detail.quotation ?? null
    underwriting.value = detail.underwriting ?? null
    payment.value = detail.payment ?? null
    policy.value = detail.policy
    availableTypes.value = [
      { type: 'car', name: '车险', available: true },
      { type: 'property', name: '财险', available: false },
      { type: 'life', name: '人寿险', available: false },
    ]

    messages.value = (detail.conversation_messages ?? []).map((message) => ({
      id: message.id,
      role:
        message.role === 'customer' ? 'user' : message.role === 'system' ? 'system' : 'assistant',
      content:
        message.role === 'agent'
          ? `业务员 · ${message.sender_name || '人工客服'}\n${message.content}`
          : message.content,
      timestamp: Number.isNaN(Date.parse(message.created_at))
        ? Date.now()
        : Date.parse(message.created_at),
    }))

    if (detail.plan) {
      messages.value.push({
        id: `restored_plan_${Date.now()}`,
        role: 'assistant',
        content: '当前方案（已从会话记忆恢复）',
        timestamp: Date.now(),
        structured: {
          phase: detail.phase,
          plan: detail.plan,
          vehicle: detail.vehicle,
        },
      })
    }
  }

  function setPhase(p: WorkflowPhase) {
    phase.value = p
  }

  function setVehicle(nextVehicle: VehicleInfo | null | undefined) {
    vehicle.value = nextVehicle ?? null
    if (nextVehicle?.license_plate) {
      licensePlate.value = nextVehicle.license_plate
    }
  }

  function setQuotation(nextQuotation: Quotation | null | undefined) {
    quotation.value = nextQuotation ?? null
    if (nextQuotation?.plan) plan.value = nextQuotation.plan
    if (nextQuotation?.vehicle) setVehicle(nextQuotation.vehicle)
    if (nextQuotation?.applicant) applicant.value = nextQuotation.applicant
  }

  function setPolicy(nextPolicy: Policy | null | undefined) {
    policy.value = nextPolicy ?? null
    if (nextPolicy?.vehicle) setVehicle(nextPolicy.vehicle)
    if (nextPolicy?.applicant) applicant.value = nextPolicy.applicant
  }

  function applySessionInfo(info: Partial<SessionInfo>) {
    if (info.phase) phase.value = info.phase
    if (info.license_plate) licensePlate.value = info.license_plate
    if (info.customer_type) customerType.value = info.customer_type
  }

  function reset() {
    sessionId.value = ''
    agentId.value = ''
    userId.value = ''
    phase.value = 'insurance_type_selection'
    licensePlate.value = ''
    customerType.value = ''
    vehicle.value = null
    applicant.value = null
    plan.value = null
    quotation.value = null
    underwriting.value = null
    payment.value = null
    policy.value = null
    messages.value = []
    availableTypes.value = []
  }

  return {
    sessionId,
    agentId,
    userId,
    phase,
    licensePlate,
    customerType,
    vehicle,
    applicant,
    plan,
    quotation,
    underwriting,
    payment,
    policy,
    messages,
    availableTypes,
    isCompleted,
    isAgent,
    currentPhaseIndex,
    addUserMessage,
    addAssistantMessage,
    addSystemMessage,
    removeMessage,
    setSession,
    restoreSession,
    setPhase,
    setVehicle,
    setQuotation,
    setPolicy,
    applySessionInfo,
    reset,
  }
})
