<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PhaseProgress from '../components/common/PhaseProgress.vue'
import MessageBubble from '../components/chat/MessageBubble.vue'
import QuickActions from '../components/chat/QuickActions.vue'
import { useSessionStore } from '../stores/session'
import { useUiStore } from '../stores/ui'
import { useAuthStore } from '../stores/auth'
import {
  chatGenerateQuotation,
  chatBatchDeleteSessions,
  chatDeleteSession,
  chatGetSession,
  chatInit,
  chatInitiatePayment,
  chatMessage,
  chatModifyPlan,
  chatProviderStatus,
  chatRecentSessions,
  chatRecommend,
  chatRollbackWorkflow,
  chatSessionMessages,
  chatSelectType,
  chatSubmitUnderwriting,
  chatUploadIdCard,
  chatUploadVehicleLicense,
  chatUseLastYear,
  chatVerifyPayment,
  chatSubmitVerification,
  setChatOperationSignal,
} from '../api'
import type {
  ChatAttachment,
  ProviderFeatureStatus,
  RecentChatSession,
  WorkflowPhase,
} from '../api/types'
import { PHASE_LABELS, PHASE_ORDER } from '../constants'

const sessionStore = useSessionStore()
const uiStore = useUiStore()
const authStore = useAuthStore()

const inputText = ref('')
const scrollContainer = ref<HTMLElement | null>(null)
const showVerification = ref(false)
const verificationPhoto = ref<File | null>(null)
const verificationVideo = ref<File | null>(null)
const chatFileInput = ref<HTMLInputElement | null>(null)
const documentPairInput = ref<HTMLInputElement | null>(null)
const chatInput = ref<HTMLInputElement | null>(null)
const agentThinking = ref(false)
const agentProcessingText = ref('智能体正在处理')
let operationController: AbortController | null = null
let operationGeneration = 0
const failedChatText = ref('')
const showRetry = ref(false)
let retryAction: (() => Promise<void>) | null = null
let retryWithoutUserEcho = false
const previewAttachment = ref<ChatAttachment | null>(null)
const stagedPreviewUrls = ref<Record<string, string>>({})
const stagedPreviewSources = new Map<string, { file: File; url: string }>()
const sentAttachmentUrls: string[] = []

type DocumentPairPhase = 'vehicle' | 'id'
interface DocumentPairItem {
  id: string
  side: 'front' | 'back'
  file: File
  previewUrl: string
}

const showDocumentPairDialog = ref(false)
const documentPairPhase = ref<DocumentPairPhase>('vehicle')
const documentPairItems = ref<DocumentPairItem[]>([])
const documentPairBusy = ref(false)
const appendDocumentPairSelection = ref(false)
const restoredFromMemory = ref(false)
const showChatHistory = ref(false)
const chatHistoryLoading = ref(false)
const switchingSessionId = ref('')
const chatHistory = ref<RecentChatSession[]>([])
const selectedHistoryIds = ref<string[]>([])
const pendingDeleteIds = ref<string[]>([])
const historyDeleteBusy = ref(false)
const providerStatus = ref<ProviderFeatureStatus | null>(null)
const showRollbackDialog = ref(false)
const rollbackBusy = ref(false)
const selectedRollbackPhase = ref<WorkflowPhase | null>(null)

const currentPlate = computed(
  () => sessionStore.licensePlate || sessionStore.vehicle?.license_plate || '',
)
const latestPlanMessageId = computed(() => {
  for (let index = sessionStore.messages.length - 1; index >= 0; index -= 1) {
    const message = sessionStore.messages[index]
    if (
      message?.role === 'assistant' &&
      (message.structured?.quotation?.plan || message.structured?.plan)
    ) {
      return message.id
    }
  }
  return ''
})
const latestAssistantMessageId = computed(() => {
  for (let index = sessionStore.messages.length - 1; index >= 0; index -= 1) {
    const message = sessionStore.messages[index]
    if (message?.role === 'assistant') return message.id
  }
  return ''
})
const hasVehicle = computed(() => Boolean(sessionStore.vehicle))
const canSendInput = computed(() => sessionStore.phase !== 'completed')
const rollbackTargets = computed(() => {
  const currentIndex = PHASE_ORDER.indexOf(sessionStore.phase)
  if (currentIndex <= 0 || sessionStore.phase === 'completed') return []
  return PHASE_ORDER.slice(0, currentIndex).reverse()
})

const attachmentLabel = computed(() => {
  if (sessionStore.phase === 'collecting_info') {
    return '上传行驶证正反面'
  }
  if (sessionStore.phase === 'identity_verification') {
    return '上传身份证正反面'
  }
  if (showVerification.value || sessionStore.phase === 'underwriting') {
    return '上传验车材料'
  }
  return ''
})

const currentQuestion = computed(() => {
  if (sessionStore.phase === 'insurance_type_selection') {
    return {
      title: '您好，要办理哪一种保险？',
      body: '目前车险可以直接办理，财险和人寿险还在接入中。',
    }
  }
  if (sessionStore.phase === 'collecting_info') {
    return {
      title: '请一次上传行驶证正反面',
      body: '选择时同时选中正页和副页两张照片，确认后我会统一识别。老用户也可以直接发送车牌号。',
    }
  }
  if (sessionStore.phase === 'recommending') {
    return {
      title: sessionStore.plan ? '这套方案合适吗？' : '车辆信息已收到',
      body: sessionStore.plan
        ? '可以直接确认方案，也可以继续告诉我需要调整的保司、险种或保额。'
        : '我正在根据车辆信息生成推荐的投保方案。',
    }
  }
  if (sessionStore.phase === 'identity_verification') {
    return {
      title: '请一次上传身份证正反面',
      body: '同时选择身份证正面和反面两张照片，我会统一核对并生成报价。',
    }
  }
  if (sessionStore.phase === 'quoting') {
    return {
      title: '报价信息已生成',
      body: '请核对车辆、投保人和保障日期。确认无误后，我会提交保险公司核保。',
    }
  }
  if (sessionStore.phase === 'underwriting') {
    return {
      title: showVerification.value ? '这笔核保需要补充验车材料' : '正在提交核保',
      body: showVerification.value
        ? '请发一张验车照片或一段验车视频，我会继续提交。'
        : '保险公司的核保结果返回后，我会继续提示下一步。',
    }
  }
  if (sessionStore.phase === 'payment') {
    return {
      title: sessionStore.payment ? '支付订单已生成' : '核保已通过',
      body: sessionStore.payment
        ? '可以在下方订单中完成支付，支付后告诉我，我来核验结果。'
        : '可以发起支付，付款会跳转到第三方支付平台。',
    }
  }
  if (sessionStore.phase === 'completed') {
    return {
      title: '保单已经生成',
      body: '您可以在对话中查看完整保单明细。需要处理其他车辆时，请开始新会话。',
    }
  }
  return {
    title: '已为您转接人工',
    body: '业务员接管后会在当前会话中继续处理。',
  }
})

const showAgentPrompt = computed(
  () => !agentThinking.value && sessionStore.messages.every((message) => message.role === 'system'),
)

const inputPlaceholder = computed(() => {
  const placeholders: Partial<Record<WorkflowPhase, string>> = {
    insurance_type_selection: '可以问“车险介绍”，或回复“开始办理车险”',
    collecting_info: '发送车牌号查询老用户，或点击附件上传行驶证',
    recommending: '继续修改，如：三者改到200万 / 换成太平洋保险',
    identity_verification: '点击附件发送身份证正反面',
    quoting: '回复“确认”提交核保',
    underwriting: '回复“提交核保”，或发送验车材料',
    payment: '回复“支付”或“核验支付结果”',
    transferred_to_human: '业务员接管中，可以直接留言',
  }
  return placeholders[sessionStore.phase] ?? '输入消息'
})

type ContextualActionKind =
  | 'upload_vehicle'
  | 'upload_identity'
  | 'upload_verification'
  | 'submit_underwriting'
  | 'initiate_payment'
  | 'verify_payment'

const contextualChatAction = computed<{
  title: string
  body: string
  button: string
  icon: string
  kind: ContextualActionKind
} | null>(() => {
  if (sessionStore.phase === 'collecting_info') {
    return {
      title: '上传行驶证正反面',
      body: '一次选择正页和副页两张照片；也可以直接在输入框发送车牌号查询老用户。',
      button: '选择行驶证照片',
      icon: '📄',
      kind: 'upload_vehicle',
    }
  }
  if (sessionStore.phase === 'identity_verification') {
    return {
      title: '上传身份证正反面',
      body: '一次选择身份证正面和反面两张照片，系统识别后继续生成报价。',
      button: '选择身份证照片',
      icon: '🪪',
      kind: 'upload_identity',
    }
  }
  if (showVerification.value) {
    return {
      title: '上传验车材料',
      body: '可以上传一张验车照片或一段验车视频，提交后继续核保流程。',
      button: '选择验车材料',
      icon: '🎥',
      kind: 'upload_verification',
    }
  }
  if (sessionStore.phase === 'quoting') {
    return {
      title: '报价信息已确认',
      body: '确认车辆、投保人和保障日期无误后，可以提交保险公司核保。',
      button: '提交核保',
      icon: '✅',
      kind: 'submit_underwriting',
    }
  }
  if (sessionStore.phase === 'payment') {
    return sessionStore.payment
      ? {
          title: '支付订单已创建',
          body: '在第三方平台完成支付后，回到对话中核验支付结果。',
          button: '核验支付结果',
          icon: '🔄',
          kind: 'verify_payment',
        }
      : {
          title: '核保已通过',
          body: '下一步需要确认支付保费，支付将在第三方平台完成。',
          button: '确认并支付',
          icon: '💳',
          kind: 'initiate_payment',
        }
  }
  return null
})

function runContextualAction(kind: ContextualActionKind) {
  if (kind === 'upload_vehicle' || kind === 'upload_identity') {
    openDocumentPairPicker()
    return
  }
  if (kind === 'upload_verification') {
    chatFileInput.value?.click()
    return
  }
  if (kind === 'submit_underwriting') {
    void handleSubmitUnderwriting()
    return
  }
  if (kind === 'initiate_payment') {
    void handleInitiatePayment()
    return
  }
  if (kind === 'verify_payment') {
    void handleVerifyPayment()
  }
}

const stagedFiles = computed(() => {
  if (showVerification.value || sessionStore.phase === 'underwriting') {
    return [
      { key: 'verification_photo', label: '验车照片', file: verificationPhoto.value },
      { key: 'verification_video', label: '验车视频', file: verificationVideo.value },
    ].filter((item) => item.file)
  }
  return []
})

const stagedFileView = computed(() =>
  stagedFiles.value.map((item) => ({
    ...item,
    previewUrl: stagedPreviewUrls.value[item.key] || '',
  })),
)

const documentPairReady = computed(() => documentPairItems.value.length === 2)

const documentPairTitle = computed(() =>
  documentPairPhase.value === 'vehicle' ? '确认行驶证正反面' : '确认身份证正反面',
)

function pairSideLabel(side: 'front' | 'back') {
  if (documentPairPhase.value === 'vehicle') {
    return side === 'front' ? '行驶证正页' : '行驶证副页'
  }
  return side === 'front' ? '身份证正面' : '身份证反面'
}

function scrollToBottom() {
  nextTick(() => {
    if (scrollContainer.value) {
      scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
    }
  })
}

let scrollTimers: number[] = []
function scheduleScrollToBottom() {
  scrollTimers.forEach((timer) => window.clearTimeout(timer))
  scrollTimers = [0, 140, 360].map((delay) => window.setTimeout(scrollToBottom, delay))
}

let humanPollTimer: number | null = null
let lastHumanMessageTime = ''
const seenHumanMessageIds = new Set<string>()

async function pollHumanMessages() {
  if (!sessionStore.sessionId) return
  try {
    const res = await chatSessionMessages(sessionStore.sessionId, lastHumanMessageTime)
    for (const item of res.messages) {
      lastHumanMessageTime = item.created_at || lastHumanMessageTime
      if (item.role === 'customer' || seenHumanMessageIds.has(item.id)) continue
      seenHumanMessageIds.add(item.id)
      if (item.role === 'agent') {
        sessionStore.addAssistantMessage(
          `业务员 · ${item.sender_name || '人工客服'}\n${item.content}`,
        )
      } else if (item.role === 'system') {
        sessionStore.addSystemMessage(item.content)
      }
    }
    if (res.phase && res.phase !== 'transferred_to_human') {
      sessionStore.setPhase(res.phase as WorkflowPhase)
      stopHumanPolling()
    }
  } catch {
    // Transient failures are retried by the next polling interval.
  }
}

function startHumanPolling() {
  if (humanPollTimer !== null) return
  void pollHumanMessages()
  humanPollTimer = window.setInterval(pollHumanMessages, 2000)
}

function stopHumanPolling() {
  if (humanPollTimer !== null) {
    window.clearInterval(humanPollTimer)
    humanPollTimer = null
  }
}

function startThinking(label = '智能体正在处理') {
  clearRetry()
  operationController?.abort()
  const generation = ++operationGeneration
  operationController = new AbortController()
  setChatOperationSignal(operationController.signal)
  agentProcessingText.value = label
  agentThinking.value = true
  return generation
}

function stopThinking(generation?: number) {
  if (generation !== undefined && generation !== operationGeneration) return
  setChatOperationSignal(null)
  operationController = null
  agentThinking.value = false
}

function interruptOperation() {
  operationGeneration += 1
  operationController?.abort()
  operationController = null
  setChatOperationSignal(null)
  agentThinking.value = false
  uiStore.showToast('info', '已暂停当前操作')
  sessionStore.addSystemMessage('已暂停当前处理，您可以重新操作或发送消息。')
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function reportOperationError(error: unknown) {
  if (!isAbortError(error)) {
    uiStore.showToast('error', (error as Error).message)
  }
}

function isProviderIncompleteError(error: unknown) {
  return /API未完成/.test((error as Error)?.message || '')
}

function isActiveOperation(operation: number | null) {
  return operation === null || operation === operationGeneration
}

function offerRetry(action: () => Promise<void>) {
  retryAction = action
  showRetry.value = true
}

function clearRetry() {
  retryAction = null
  showRetry.value = false
  failedChatText.value = ''
}

async function runRetry() {
  const action = retryAction
  clearRetry()
  if (action) await action()
}

async function retryLatestAssistant() {
  if (agentThinking.value) return
  const assistant = sessionStore.messages.find(
    (message) => message.id === latestAssistantMessageId.value,
  )
  if (!assistant) return
  const retryText = retryTextForMessage(assistant.id)
  if (!retryText) {
    uiStore.showToast('info', '当前回答没有可重试的用户问题，请重新发送具体问题。')
    return
  }

  sessionStore.removeMessage(assistant.id)
  retryWithoutUserEcho = true
  inputText.value = retryText
  await sendInput()
}

function retryTextForMessage(messageId: string) {
  const index = sessionStore.messages.findIndex((message) => message.id === messageId)
  if (index === -1) return ''
  const directText = sessionStore.messages[index]?.structured?.retry_text?.trim()
  if (directText) return directText

  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const message = sessionStore.messages[cursor]
    if (message?.role !== 'user') continue
    const content = message.content.trim()
    if (
      content.startsWith('已一次性上传') ||
      content.startsWith('已发送验车') ||
      content.startsWith('已发送')
    ) {
      return ''
    }
    return content
  }
  return ''
}

watch(() => sessionStore.messages.length, scheduleScrollToBottom)
watch(() => sessionStore.phase, scheduleScrollToBottom)
watch(stagedFiles, scheduleScrollToBottom, { deep: true })
watch(showVerification, scheduleScrollToBottom)
watch(agentThinking, scheduleScrollToBottom)
watch(
  () => sessionStore.phase,
  (phase) => {
    if (phase === 'transferred_to_human') startHumanPolling()
    else stopHumanPolling()
  },
  { immediate: true },
)
watch(
  stagedFiles,
  (files) => {
    const activeKeys = new Set(files.map((file) => file.key))
    for (const [key, source] of stagedPreviewSources) {
      if (!activeKeys.has(key)) {
        URL.revokeObjectURL(source.url)
        stagedPreviewSources.delete(key)
        delete stagedPreviewUrls.value[key]
      }
    }
    for (const item of files) {
      if (!item.file) continue
      const current = stagedPreviewSources.get(item.key)
      if (current?.file === item.file) continue
      if (current) URL.revokeObjectURL(current.url)
      const url = URL.createObjectURL(item.file)
      stagedPreviewSources.set(item.key, { file: item.file, url })
      stagedPreviewUrls.value[item.key] = url
    }
  },
  { immediate: true, deep: true },
)

onMounted(async () => {
  void loadProviderStatus()
  await initSession()
})

onBeforeUnmount(() => {
  operationController?.abort()
  setChatOperationSignal(null)
  scrollTimers.forEach((timer) => window.clearTimeout(timer))
  stopHumanPolling()
  for (const source of stagedPreviewSources.values()) {
    URL.revokeObjectURL(source.url)
  }
  documentPairItems.value.forEach((item) => URL.revokeObjectURL(item.previewUrl))
  sentAttachmentUrls.forEach((url) => URL.revokeObjectURL(url))
})

async function restoreChatMemory(
  sessionId: string,
  notice = '已恢复会话记忆，可以继续之前的办理进度。',
) {
  const detail = await chatGetSession(sessionId)
  stopHumanPolling()
  clearRetry()
  sessionStore.restoreSession(detail)
  seenHumanMessageIds.clear()
  lastHumanMessageTime = ''
  for (const message of detail.conversation_messages ?? []) {
    seenHumanMessageIds.add(message.id)
    if (message.created_at > lastHumanMessageTime) {
      lastHumanMessageTime = message.created_at
    }
  }
  restoredFromMemory.value = true
  if (notice) sessionStore.addSystemMessage(notice)
  if (detail.phase === 'transferred_to_human') startHumanPolling()
}

async function initSession(forceNew = false) {
  let operation: number | null = null
  try {
    uiStore.setLoading(true, '正在初始化会话...')
    operation = startThinking('正在初始化会话')
    if (!forceNew) {
      try {
        const recent = await chatRecentSessions(8)
        const candidate =
          recent.sessions.find((item) => item.phase !== 'completed') ?? recent.sessions[0]
        if (candidate) {
          await restoreChatMemory(
            candidate.session_id,
            '已恢复上次会话记忆，可以继续之前的办理进度。',
          )
          return
        }
      } catch {
        uiStore.showToast('warning', '会话记忆加载失败，已创建新会话')
      }
    }
    const agentId = authStore.user?.agent_id || ''
    const userId = authStore.user?.id || ''
    const res = await chatInit(agentId, userId)
    sessionStore.setSession(res.session_id, agentId, userId, res.available_types)
    sessionStore.addSystemMessage(res.message)
    restoredFromMemory.value = false
  } catch (e) {
    if (isActiveOperation(operation)) {
      offerRetry(initSession)
      reportOperationError(e)
    }
  } finally {
    if (operation !== null) stopThinking(operation)
    uiStore.setLoading(false)
  }
}

async function loadChatHistory() {
  chatHistoryLoading.value = true
  try {
    const result = await chatRecentSessions(30)
    chatHistory.value = result.sessions
    const availableIds = new Set(result.sessions.map((item) => item.session_id))
    selectedHistoryIds.value = selectedHistoryIds.value.filter((id) => availableIds.has(id))
  } catch (e) {
    uiStore.showToast('error', (e as Error).message || '会话记录加载失败')
  } finally {
    chatHistoryLoading.value = false
  }
}

async function loadProviderStatus() {
  try {
    providerStatus.value = await chatProviderStatus()
  } catch {
    providerStatus.value = null
  }
}

function openChatHistory() {
  selectedHistoryIds.value = []
  pendingDeleteIds.value = []
  showChatHistory.value = true
  void loadChatHistory()
}

function toggleHistorySelection(sessionId: string) {
  selectedHistoryIds.value = selectedHistoryIds.value.includes(sessionId)
    ? selectedHistoryIds.value.filter((id) => id !== sessionId)
    : [...selectedHistoryIds.value, sessionId]
}

function toggleSelectAllHistory() {
  selectedHistoryIds.value =
    selectedHistoryIds.value.length === chatHistory.value.length
      ? []
      : chatHistory.value.map((item) => item.session_id)
}

function requestDeleteSession(sessionId: string) {
  pendingDeleteIds.value = [sessionId]
}

function requestBatchDeleteSessions() {
  if (selectedHistoryIds.value.length) {
    pendingDeleteIds.value = [...selectedHistoryIds.value]
  }
}

async function executeDeleteSessions() {
  const ids = [...pendingDeleteIds.value]
  if (!ids.length || historyDeleteBusy.value) return
  historyDeleteBusy.value = true
  const deletingCurrent = ids.includes(sessionStore.sessionId)
  try {
    if (ids.length === 1) {
      await chatDeleteSession(ids[0]!)
    } else {
      await chatBatchDeleteSessions(ids)
    }
    const deleted = new Set(ids)
    chatHistory.value = chatHistory.value.filter((item) => !deleted.has(item.session_id))
    selectedHistoryIds.value = selectedHistoryIds.value.filter((id) => !deleted.has(id))
    pendingDeleteIds.value = []
    uiStore.showToast('success', `已删除 ${ids.length} 条会话记录`)

    if (deletingCurrent) {
      const nextSession = chatHistory.value[0]
      showChatHistory.value = false
      if (nextSession) {
        await restoreChatMemory(
          nextSession.session_id,
          `原会话已删除，已切换到 ${nextSession.plate || '下一条会话'}。`,
        )
      } else {
        sessionStore.reset()
        await initSession(true)
      }
    }
  } catch (e) {
    uiStore.showToast('error', (e as Error).message || '会话记录删除失败')
  } finally {
    historyDeleteBusy.value = false
  }
}

async function switchChatSession(record: RecentChatSession) {
  if (switchingSessionId.value) return
  if (record.session_id === sessionStore.sessionId) {
    showChatHistory.value = false
    return
  }
  if (agentThinking.value) {
    uiStore.showToast('warning', '请先暂停当前处理，再切换会话')
    return
  }
  switchingSessionId.value = record.session_id
  try {
    closeDocumentPairDialog()
    inputText.value = ''
    verificationPhoto.value = null
    verificationVideo.value = null
    showVerification.value = false
    await restoreChatMemory(record.session_id, `已恢复 ${record.plate || '该会话'} 的会话记录。`)
    showChatHistory.value = false
    uiStore.showToast('success', '已切换会话记录')
  } catch (e) {
    uiStore.showToast('error', (e as Error).message || '会话记录恢复失败')
  } finally {
    switchingSessionId.value = ''
  }
}

function formatHistoryTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function openRollbackDialog() {
  if (!rollbackTargets.value.length) return
  selectedRollbackPhase.value = rollbackTargets.value[0] ?? null
  showRollbackDialog.value = true
}

function rollbackImpactLabel(target: WorkflowPhase) {
  const targetIndex = PHASE_ORDER.indexOf(target)
  const quotingIndex = PHASE_ORDER.indexOf('quoting')
  if (targetIndex < quotingIndex) {
    return '将作废当前报价、核保和支付结果，需要重新完成后续步骤。'
  }
  if (targetIndex === quotingIndex) {
    return '将作废核保和支付结果，可以重新生成保司报价。'
  }
  return '将作废现有核保和支付结果，需要重新提交核保。'
}

async function performRollback() {
  const target = selectedRollbackPhase.value
  if (!target || rollbackBusy.value) return
  if (agentThinking.value) {
    uiStore.showToast('warning', '请先暂停当前处理，再回退步骤')
    return
  }
  rollbackBusy.value = true
  try {
    const result = await chatRollbackWorkflow(sessionStore.sessionId, target)
    await restoreChatMemory(sessionStore.sessionId, '')
    showRollbackDialog.value = false
    uiStore.showToast('success', result.message)
  } catch (e) {
    uiStore.showToast('error', (e as Error).message || '流程回退失败')
  } finally {
    rollbackBusy.value = false
  }
}

async function handleSelectType(type: string) {
  const selected = sessionStore.availableTypes.find((item) => item.type === type)
  if (selected && !selected.available) {
    uiStore.showToast('warning', `${selected.name}暂未开放`)
    return
  }
  let operation: number | null = null
  try {
    operation = startThinking('智能体正在准备会话')
    const res = await chatSelectType(sessionStore.sessionId, type)
    sessionStore.addAssistantMessage(res.message, {
      phase: res.phase as typeof sessionStore.phase,
    })
  } catch (e) {
    if (isActiveOperation(operation)) {
      offerRetry(async () => {
        await handleSelectType(type)
      })
      reportOperationError(e)
    }
  } finally {
    if (operation !== null) stopThinking(operation)
  }
}

async function handleUploadVehicle(files: Record<string, File | null>) {
  const front = files['front_image']
  const back = files['back_image']
  if (!front || !back) return false
  let succeeded = false
  let operation: number | null = null
  try {
    operation = startThinking('智能体正在识别行驶证')
    const res = await chatUploadVehicleLicense(sessionStore.sessionId, front, back)
    succeeded = true
    sessionStore.addAssistantMessage(res.message, {
      phase: res.phase as typeof sessionStore.phase,
      vehicle: res.vehicle,
      transferred_to_human: res.transferred_to_human,
    })
    if (res.vehicle) sessionStore.setVehicle(res.vehicle)
    if (res.transferred_to_human) {
      sessionStore.setPhase('transferred_to_human')
    } else if (res.vehicle) {
      await handleRecommend()
    }
  } catch (e) {
    if (isActiveOperation(operation)) {
      offerRetry(async () => {
        await handleUploadVehicle({ front_image: front, back_image: back })
      })
      reportOperationError(e)
    }
  } finally {
    if (operation !== null) stopThinking(operation)
  }
  return succeeded
}

async function handleRecommend() {
  let operation: number | null = null
  try {
    operation = startThinking('智能体正在生成推荐方案')
    const res = await chatRecommend(sessionStore.sessionId)
    sessionStore.addAssistantMessage(res.message, {
      phase: res.phase as typeof sessionStore.phase,
      plan: res.plan,
    })
    sessionStore.plan = res.plan
  } catch (e) {
    if (isActiveOperation(operation)) {
      offerRetry(handleRecommend)
      reportOperationError(e)
    }
  } finally {
    if (operation !== null) stopThinking(operation)
  }
}

async function handleUseLastYear() {
  let operation: number | null = null
  try {
    operation = startThinking('智能体正在准备去年方案')
    const res = await chatUseLastYear(sessionStore.sessionId)
    sessionStore.addAssistantMessage(res.message, {
      phase: res.phase as typeof sessionStore.phase,
      plan: res.plan,
    })
    sessionStore.plan = res.plan
  } catch (e) {
    if (isActiveOperation(operation)) {
      offerRetry(handleUseLastYear)
      reportOperationError(e)
    }
  } finally {
    if (operation !== null) stopThinking(operation)
  }
}

async function sendInput() {
  const text = inputText.value.trim()
  if (!text) return
  const phaseBefore = sessionStore.phase
  let historyMessages = sessionStore.messages.filter(
    (item): item is typeof item & { role: 'user' | 'assistant' } =>
      item.role === 'user' || item.role === 'assistant',
  )
  if (
    retryWithoutUserEcho &&
    historyMessages.at(-1)?.role === 'user' &&
    historyMessages.at(-1)?.content === text
  ) {
    historyMessages = historyMessages.slice(0, -1)
  }
  const history = historyMessages
    .slice(-12)
    .map((item) => ({ role: item.role, content: item.content }))
  if (!retryWithoutUserEcho) {
    sessionStore.addUserMessage(text)
  }
  retryWithoutUserEcho = false
  inputText.value = ''
  const operation = phaseBefore !== 'transferred_to_human' ? startThinking() : null

  try {
    const res = await chatMessage(sessionStore.sessionId, text, history)
    if (res.action === 'waiting_human') {
      uiStore.showToast('info', '消息已发送给业务员')
      clearRetry()
      return
    }
    sessionStore.addAssistantMessage(res.message, {
      phase: res.phase as typeof sessionStore.phase,
      retry_text: text,
      vehicle: res.vehicle,
      plan: res.plan,
      quotation: res.quotation,
      underwriting: res.underwriting,
      payment: res.payment,
      policy: res.policy,
      last_year_plan: res.last_year_plan,
      customer_type: res.customer_type,
      transferred_to_human: res.transferred_to_human,
      needs_verification: res.needs_verification,
      knowledge_sources: res.knowledge_sources,
    })
    if (res.vehicle) sessionStore.setVehicle(res.vehicle)
    if (res.plan) sessionStore.plan = res.plan
    if (res.quotation) sessionStore.setQuotation(res.quotation)
    if (res.underwriting) sessionStore.underwriting = res.underwriting
    if (res.payment) sessionStore.payment = res.payment
    if (res.policy) sessionStore.setPolicy(res.policy)
    if (res.customer_type) sessionStore.customerType = res.customer_type
    if (res.needs_verification) showVerification.value = true
    clearRetry()
  } catch (e) {
    if (isActiveOperation(operation)) {
      failedChatText.value = text
      offerRetry(async () => {
        retryWithoutUserEcho = true
        inputText.value = text
        await sendInput()
      })
      reportOperationError(e)
    }
  } finally {
    if (operation !== null) stopThinking(operation)
  }
}

async function handleModifyFromCard(text: string, addUserEcho = true) {
  if (addUserEcho) sessionStore.addUserMessage(text)
  let operation: number | null = null
  try {
    operation = startThinking('智能体正在更新方案')
    const res = await chatModifyPlan(sessionStore.sessionId, text)
    sessionStore.addAssistantMessage(res.message, {
      phase: res.phase as typeof sessionStore.phase,
      plan: res.plan,
    })
    sessionStore.plan = res.plan
  } catch (e) {
    if (isActiveOperation(operation)) {
      offerRetry(async () => {
        await handleModifyFromCard(text, false)
      })
      reportOperationError(e)
    }
  } finally {
    if (operation !== null) stopThinking(operation)
  }
}

async function handleConfirmPlan() {
  let operation: number | null = null
  try {
    operation = startThinking('智能体正在确认方案')
    const res = await chatModifyPlan(sessionStore.sessionId, '确认')
    sessionStore.addAssistantMessage(res.message, {
      phase: res.phase as typeof sessionStore.phase,
      plan: res.plan,
    })
    sessionStore.plan = res.plan
    if (res.phase === 'identity_verification' && sessionStore.applicant) {
      await handleGenerateQuotation()
    }
  } catch (e) {
    if (isActiveOperation(operation)) {
      offerRetry(handleConfirmPlan)
      reportOperationError(e)
    }
  } finally {
    if (operation !== null) stopThinking(operation)
  }
}

async function handleUploadIdCard(files: Record<string, File | null>) {
  const front = files['front_image']
  const back = files['back_image']
  if (!front || !back) return false
  let succeeded = false
  let operation: number | null = null
  try {
    operation = startThinking('智能体正在识别身份证')
    const res = await chatUploadIdCard(sessionStore.sessionId, front, back)
    succeeded = true
    sessionStore.addAssistantMessage(res.message, {
      phase: res.phase as typeof sessionStore.phase,
      id_card: res.id_card,
      transferred_to_human: res.transferred_to_human,
    })
    if (res.id_card) sessionStore.applicant = res.id_card
    if (res.transferred_to_human) {
      sessionStore.setPhase('transferred_to_human')
    } else {
      await handleGenerateQuotation()
    }
  } catch (e) {
    if (isActiveOperation(operation)) {
      offerRetry(async () => {
        await handleUploadIdCard({ front_image: front, back_image: back })
      })
      reportOperationError(e)
    }
  } finally {
    if (operation !== null) stopThinking(operation)
  }
  return succeeded
}

async function handleGenerateQuotation() {
  if (providerStatus.value?.provider_status.quote === false) {
    uiStore.showToast('warning', '报价API未完成，当前无法生成真实报价')
    return
  }
  let operation: number | null = null
  try {
    operation = startThinking('智能体正在生成报价')
    const res = await chatGenerateQuotation(sessionStore.sessionId)
    sessionStore.addAssistantMessage(res.message, {
      phase: res.phase as typeof sessionStore.phase,
      quotation: res.quotation,
      knowledge_sources: res.knowledge_sources,
    })
    sessionStore.setQuotation(res.quotation)
  } catch (e) {
    if (isActiveOperation(operation)) {
      if (!isProviderIncompleteError(e)) offerRetry(handleGenerateQuotation)
      reportOperationError(e)
    }
  } finally {
    if (operation !== null) stopThinking(operation)
  }
}

async function handleConfirmQuotation() {
  await handleSubmitUnderwriting()
}

async function handleSubmitUnderwriting() {
  if (providerStatus.value?.provider_status.underwriting === false) {
    uiStore.showToast('warning', '核保API未完成，当前无法提交核保')
    return
  }
  let operation: number | null = null
  try {
    operation = startThinking('智能体正在提交核保')
    const res = await chatSubmitUnderwriting(sessionStore.sessionId)
    sessionStore.addAssistantMessage(res.message, {
      phase: res.phase as typeof sessionStore.phase,
      underwriting: res.underwriting,
      needs_verification: res.needs_verification,
      knowledge_sources: res.knowledge_sources,
    })
    sessionStore.underwriting = res.underwriting
    if (res.needs_verification) {
      showVerification.value = true
    }
  } catch (e) {
    if (isActiveOperation(operation)) {
      if (!isProviderIncompleteError(e)) offerRetry(handleSubmitUnderwriting)
      reportOperationError(e)
    }
  } finally {
    if (operation !== null) stopThinking(operation)
  }
}

async function handleSubmitVerification() {
  if (providerStatus.value?.provider_status.underwriting === false) {
    uiStore.showToast('warning', '核保API未完成，当前无法提交验车材料')
    return
  }
  let operation: number | null = null
  try {
    operation = startThinking('智能体正在提交验车材料')
    const res = await chatSubmitVerification(
      sessionStore.sessionId,
      verificationPhoto.value ?? undefined,
      verificationVideo.value ?? undefined,
    )
    sessionStore.addAssistantMessage(res.message, {
      phase: res.phase as typeof sessionStore.phase,
      underwriting: res.underwriting,
    })
    sessionStore.underwriting = res.underwriting
    showVerification.value = false
    verificationPhoto.value = null
    verificationVideo.value = null
  } catch (e) {
    if (isActiveOperation(operation)) {
      if (!isProviderIncompleteError(e)) offerRetry(handleSubmitVerification)
      reportOperationError(e)
    }
  } finally {
    if (operation !== null) stopThinking(operation)
  }
}

async function handleInitiatePayment() {
  if (providerStatus.value?.provider_status.payment === false) {
    uiStore.showToast('warning', '支付API未完成，当前无法创建真实支付订单')
    return
  }
  let operation: number | null = null
  try {
    operation = startThinking('智能体正在创建支付订单')
    const res = await chatInitiatePayment(sessionStore.sessionId)
    sessionStore.addAssistantMessage(res.message, {
      phase: res.phase as typeof sessionStore.phase,
      payment: res.payment,
    })
    sessionStore.payment = res.payment
  } catch (e) {
    if (isActiveOperation(operation)) {
      if (!isProviderIncompleteError(e)) offerRetry(handleInitiatePayment)
      reportOperationError(e)
    }
  } finally {
    if (operation !== null) stopThinking(operation)
  }
}

async function handleVerifyPayment() {
  if (providerStatus.value?.provider_status.payment === false) {
    uiStore.showToast('warning', '支付API未完成，当前无法核验支付回调')
    return
  }
  let operation: number | null = null
  try {
    operation = startThinking('智能体正在核验支付结果')
    const res = await chatVerifyPayment(sessionStore.sessionId)
    sessionStore.addAssistantMessage(res.message, {
      phase: res.phase as typeof sessionStore.phase,
      payment: res.payment,
      policy: res.policy,
    })
    if (res.payment) sessionStore.payment = res.payment
    if (res.policy) {
      sessionStore.setPolicy(res.policy)
      sessionStore.setPhase('completed')
    }
  } catch (e) {
    if (isActiveOperation(operation)) {
      if (!isProviderIncompleteError(e)) offerRetry(handleVerifyPayment)
      reportOperationError(e)
    }
  } finally {
    if (operation !== null) stopThinking(operation)
  }
}

async function handleRestart() {
  closeDocumentPairDialog()
  stopHumanPolling()
  lastHumanMessageTime = ''
  seenHumanMessageIds.clear()
  for (const source of stagedPreviewSources.values()) {
    URL.revokeObjectURL(source.url)
  }
  stagedPreviewSources.clear()
  stagedPreviewUrls.value = {}
  sentAttachmentUrls.forEach((url) => URL.revokeObjectURL(url))
  sentAttachmentUrls.length = 0
  previewAttachment.value = null
  verificationPhoto.value = null
  verificationVideo.value = null
  showVerification.value = false
  sessionStore.reset()
  await initSession(true)
}

function focusChatInput() {
  nextTick(() => chatInput.value?.focus())
}

function openAttachmentPicker() {
  if (!attachmentLabel.value) {
    uiStore.showToast('info', '当前阶段不需要上传材料')
    return
  }
  if (sessionStore.phase === 'collecting_info' || sessionStore.phase === 'identity_verification') {
    openDocumentPairPicker()
    return
  }
  chatFileInput.value?.click()
}

function openDocumentPairPicker() {
  if (sessionStore.phase !== 'collecting_info' && sessionStore.phase !== 'identity_verification') {
    return
  }
  documentPairPhase.value = sessionStore.phase === 'collecting_info' ? 'vehicle' : 'id'
  appendDocumentPairSelection.value = false
  documentPairInput.value?.click()
}

function openMissingDocumentPair() {
  if (documentPairItems.value.length !== 1) return
  appendDocumentPairSelection.value = true
  documentPairInput.value?.click()
}

function closeDocumentPairDialog() {
  documentPairItems.value.forEach((item) => URL.revokeObjectURL(item.previewUrl))
  documentPairItems.value = []
  showDocumentPairDialog.value = false
}

function onDocumentPairSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (appendDocumentPairSelection.value) {
    appendDocumentPairSelection.value = false
    const file = files[0]
    if (!file || files.length !== 1 || !file.type.startsWith('image/')) {
      uiStore.showToast('warning', '请选择缺少的另一面图片')
      return
    }
    const existingSide = documentPairItems.value[0]?.side
    documentPairItems.value.push({
      id: `document_pair_${Date.now()}_missing`,
      side: existingSide === 'front' ? 'back' : 'front',
      file,
      previewUrl: URL.createObjectURL(file),
    })
    showDocumentPairDialog.value = true
    return
  }
  if (files.length !== 2) {
    uiStore.showToast('warning', '请一次选择同一证件的正反两张图片')
    return
  }
  if (files.some((file) => !file.type.startsWith('image/'))) {
    uiStore.showToast('warning', '证件正反面都必须是图片')
    return
  }
  documentPairItems.value.forEach((item) => URL.revokeObjectURL(item.previewUrl))
  documentPairItems.value = files.map((file, index) => ({
    id: `document_pair_${Date.now()}_${index}`,
    side: index === 0 ? 'front' : 'back',
    file,
    previewUrl: URL.createObjectURL(file),
  }))
  showDocumentPairDialog.value = true
}

function handleComposerPaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files ?? []).filter(
    (file) => file.type.startsWith('image/') || file.type.startsWith('video/'),
  )
  if (!files.length) return
  event.preventDefault()

  if (sessionStore.phase === 'collecting_info' || sessionStore.phase === 'identity_verification') {
    const images = files.filter((file) => file.type.startsWith('image/')).slice(0, 2)
    if (!images.length) {
      uiStore.showToast('warning', '请粘贴证件图片')
      return
    }
    documentPairPhase.value = sessionStore.phase === 'collecting_info' ? 'vehicle' : 'id'
    if (documentPairItems.value.length === 1 && images.length === 1) {
      const pastedFile = images[0]
      if (!pastedFile) return
      const existingSide = documentPairItems.value[0]?.side
      documentPairItems.value.push({
        id: `document_pair_${Date.now()}_paste`,
        side: existingSide === 'front' ? 'back' : 'front',
        file: pastedFile,
        previewUrl: URL.createObjectURL(pastedFile),
      })
    } else {
      documentPairItems.value.forEach((item) => URL.revokeObjectURL(item.previewUrl))
      documentPairItems.value = images.map((file, index) => ({
        id: `document_pair_${Date.now()}_paste_${index}`,
        side: index === 0 ? 'front' : 'back',
        file,
        previewUrl: URL.createObjectURL(file),
      }))
    }
    showDocumentPairDialog.value = true
    return
  }

  if (files.length === 1 && (showVerification.value || sessionStore.phase === 'underwriting')) {
    const file = files[0]
    if (!file) return
    if (file.type.startsWith('video/')) {
      verificationVideo.value = file
      addAttachmentMessage('验车视频', file)
    } else {
      verificationPhoto.value = file
      addAttachmentMessage('验车照片', file)
    }
    showVerification.value = true
    void handleSubmitVerification()
  }
}

function swapDocumentSides() {
  if (documentPairItems.value.length !== 2) return
  documentPairItems.value = documentPairItems.value.map((item, index) => ({
    ...item,
    side: index === 0 ? 'back' : 'front',
  }))
}

async function submitDocumentPair() {
  if (!documentPairReady.value || documentPairBusy.value) return
  const front = documentPairItems.value.find((item) => item.side === 'front')
  const back = documentPairItems.value.find((item) => item.side === 'back')
  if (!front || !back) return

  documentPairBusy.value = true
  try {
    const messageUrls: string[] = []
    const attachments = documentPairItems.value.map((item) => {
      const previewUrl = URL.createObjectURL(item.file)
      messageUrls.push(previewUrl)
      return {
        label: pairSideLabel(item.side),
        name: item.file.name,
        type: item.file.type,
        size: item.file.size,
        previewUrl,
      }
    })
    sessionStore.addUserMessage(
      documentPairPhase.value === 'vehicle'
        ? '已一次性上传行驶证正反面'
        : '已一次性上传身份证正反面',
      { attachments },
    )
    sentAttachmentUrls.push(...messageUrls)
    closeDocumentPairDialog()

    if (documentPairPhase.value === 'vehicle') {
      await handleUploadVehicle({
        front_image: front.file,
        back_image: back.file,
      })
    } else {
      await handleUploadIdCard({
        front_image: front.file,
        back_image: back.file,
      })
    }
  } catch (e) {
    uiStore.showToast('error', (e as Error).message)
  } finally {
    documentPairBusy.value = false
  }
}

function removeStagedFile(key: string) {
  previewAttachment.value = null
  if (key === 'verification_photo') verificationPhoto.value = null
  if (key === 'verification_video') verificationVideo.value = null
}

function addAttachmentMessage(label: string, file: File) {
  const previewUrl = URL.createObjectURL(file)
  sentAttachmentUrls.push(previewUrl)
  sessionStore.addUserMessage(`已发送${label}：${file.name}`, {
    attachments: [
      {
        label,
        name: file.name,
        type: file.type,
        size: file.size,
        previewUrl,
      },
    ],
  })
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function openAttachmentPreview(attachment: ChatAttachment) {
  previewAttachment.value = attachment
}

function openStagedPreview(item: { label: string; file: File | null; previewUrl: string }) {
  if (!item.file) return
  openAttachmentPreview({
    label: item.label,
    name: item.file.name,
    type: item.file.type,
    size: item.file.size,
    previewUrl: item.previewUrl,
  })
}

async function handleChatAttachment(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  if (showVerification.value || sessionStore.phase === 'underwriting') {
    if (file.type.startsWith('video/')) {
      verificationVideo.value = file
      addAttachmentMessage('验车视频', file)
    } else if (file.type.startsWith('image/')) {
      verificationPhoto.value = file
      addAttachmentMessage('验车照片', file)
    } else {
      uiStore.showToast('warning', '请上传图片或视频文件')
      return
    }
    showVerification.value = true
    await handleSubmitVerification()
    return
  }

  uiStore.showToast('info', '当前阶段不需要上传材料')
}
</script>

<template>
  <div class="chat-view">
    <header class="cv-header">
      <div class="cv-header-left">
        <img class="cv-title-mark" src="/brand-mark.svg" alt="" />
        <div class="cv-heading">
          <h1 class="cv-title">
            {{ currentPlate ? `${currentPlate} · 车险出单` : '车险出单智能体' }}
          </h1>
          <div class="cv-subline">
            <span class="cv-subtitle">{{ PHASE_LABELS[sessionStore.phase] }}</span>
            <span v-if="restoredFromMemory" class="cv-session-caption"> 已恢复会话记忆 </span>
            <span v-else-if="currentPlate" class="cv-session-caption">会话按车牌号归档</span>
          </div>
        </div>
      </div>
      <div class="cv-header-right">
        <button
          v-if="rollbackTargets.length"
          type="button"
          class="cv-header-btn cv-header-btn--rollback"
          @click="openRollbackDialog"
        >
          回退步骤
        </button>
        <button type="button" class="cv-header-btn" @click="openChatHistory">会话记录</button>
        <button type="button" class="cv-header-btn" @click="handleRestart">新会话</button>
      </div>
    </header>

    <PhaseProgress :currentPhase="sessionStore.phase" />

    <div
      v-if="providerStatus && !providerStatus.all_ready"
      class="provider-api-warning"
      role="status"
    >
      <strong>功能未完成</strong>
      <span>{{ providerStatus.message }}。当前仅可进行方案配置，不能完成真实出单。</span>
    </div>

    <div class="cv-workspace">
      <section class="cv-conversation">
        <div ref="scrollContainer" class="cv-messages" aria-live="polite">
          <div v-if="sessionStore.messages.length === 0" class="cv-empty">
            <div class="cv-empty-icon">💬</div>
            <div class="cv-empty-text">{{ currentQuestion.body }}</div>
          </div>

          <MessageBubble
            v-for="msg in sessionStore.messages"
            :key="msg.id"
            :message="msg"
            :planArchived="msg.id !== latestPlanMessageId"
            :canRetry="msg.id === latestAssistantMessageId && Boolean(retryTextForMessage(msg.id))"
            @confirmPlan="handleConfirmPlan"
            @modifyPlan="(t: string) => handleModifyFromCard(t)"
            @retryMessage="retryLatestAssistant"
            @confirmQuotation="handleConfirmQuotation"
            @verifyPayment="handleVerifyPayment"
            @resumeFlow="handleRecommend"
            @previewAttachment="openAttachmentPreview"
          />

          <div v-if="contextualChatAction && !agentThinking" class="chat-upload-action">
            <div class="chat-upload-icon">
              {{ contextualChatAction.icon }}
            </div>
            <div class="chat-upload-copy">
              <strong>{{ contextualChatAction.title }}</strong>
              <p>{{ contextualChatAction.body }}</p>
            </div>
            <button type="button" @click="runContextualAction(contextualChatAction.kind)">
              {{ contextualChatAction.button }}
            </button>
          </div>

          <div v-if="agentThinking" class="agent-question agent-processing" aria-live="polite">
            <div class="agent-question-avatar agent-processing-avatar">AI</div>
            <div class="agent-question-body agent-processing-body">
              <span class="agent-processing-dots">
                <i />
                <i />
                <i />
              </span>
              <span>{{ agentProcessingText }}</span>
              <button type="button" class="agent-processing-stop" @click="interruptOperation">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="7" y="5" width="3.5" height="14" rx="1" />
                  <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
                </svg>
                <span>暂停</span>
              </button>
            </div>
          </div>

          <div v-if="showRetry && !agentThinking" class="chat-retry">
            <span> 操作未完成{{ failedChatText ? `：“${failedChatText}”` : '' }} </span>
            <button type="button" @click="runRetry">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 11a8 8 0 0 0-14.9-3" />
                <path d="M5 4v4h4" />
                <path d="M4 13a8 8 0 0 0 14.9 3" />
                <path d="M19 20v-4h-4" />
              </svg>
              <span>重试</span>
            </button>
          </div>

          <div v-if="showAgentPrompt" class="agent-question" aria-live="polite">
            <div class="agent-question-avatar">AI</div>
            <div class="agent-question-body">
              <div class="agent-question-title">{{ currentQuestion.title }}</div>
              <p>{{ currentQuestion.body }}</p>
              <QuickActions
                :phase="sessionStore.phase"
                :customerType="sessionStore.customerType"
                :hasPlan="!!sessionStore.plan"
                :hasVehicle="hasVehicle"
                :hasUnderwriting="!!sessionStore.underwriting"
                :hasPayment="!!sessionStore.payment"
                :availableTypes="sessionStore.availableTypes"
                @selectType="handleSelectType"
                @recommend="handleRecommend"
                @uploadVehicle="openAttachmentPicker"
                @queryPlate="focusChatInput"
                @useLastYear="handleUseLastYear"
                @confirmPlan="handleConfirmPlan"
                @uploadIdCard="openAttachmentPicker"
                @generateQuotation="handleGenerateQuotation"
                @submitUnderwriting="handleSubmitUnderwriting"
                @submitVerification="openAttachmentPicker"
                @initiatePayment="handleInitiatePayment"
                @verifyPayment="handleVerifyPayment"
                @restart="handleRestart"
              />
            </div>
          </div>
        </div>

        <div class="cv-input-area">
          <div v-if="stagedFiles.length" class="staged-files">
            <div v-for="item in stagedFileView" :key="item.key" class="staged-file">
              <button
                type="button"
                class="staged-file-preview"
                :aria-label="`预览${item.label}`"
                @click="openStagedPreview(item)"
              >
                <img
                  v-if="item.file?.type.startsWith('image/') && item.previewUrl"
                  :src="item.previewUrl"
                  :alt="item.label"
                />
                <span v-else>{{ item.file?.type.startsWith('video/') ? '🎬' : '🖼️' }}</span>
              </button>
              <span class="staged-file-copy">
                <strong>{{ item.label }}</strong>
                <small>{{ item.file?.name }}</small>
                <em>{{ item.file ? formatFileSize(item.file.size) : '' }}</em>
              </span>
              <button
                type="button"
                class="staged-file-remove"
                :aria-label="`移除${item.label}`"
                @click="removeStagedFile(item.key)"
              >
                ×
              </button>
            </div>
          </div>

          <form class="input-row" @submit.prevent="sendInput">
            <input
              ref="chatFileInput"
              type="file"
              :accept="attachmentLabel === '上传验车材料' ? 'image/*,video/*' : 'image/*'"
              hidden
              @change="handleChatAttachment"
            />
            <input
              ref="documentPairInput"
              type="file"
              accept="image/*"
              multiple
              hidden
              @change="onDocumentPairSelected"
            />
            <button
              type="button"
              class="attach-btn"
              :disabled="!attachmentLabel"
              :title="attachmentLabel || '当前阶段无需上传'"
              :aria-label="attachmentLabel || '当前阶段无需上传'"
              @click="openAttachmentPicker"
            >
              +
            </button>
            <input
              ref="chatInput"
              v-model="inputText"
              class="chat-input"
              type="text"
              :placeholder="inputPlaceholder"
              @paste="handleComposerPaste"
            />
            <button type="submit" class="send-btn" :disabled="!canSendInput || !inputText.trim()">
              发送
            </button>
          </form>
          <div class="composer-hint">
            {{ attachmentLabel || '可以直接输入回答，也可以使用上方快捷选项' }}
          </div>
        </div>
      </section>
    </div>

    <div v-if="showDocumentPairDialog" class="modal-backdrop" @click.self="closeDocumentPairDialog">
      <div class="dialog-card dialog-card--wide" role="dialog" aria-modal="true">
        <div class="dialog-heading">
          <div>
            <div class="dialog-title">{{ documentPairTitle }}</div>
            <p>请确认两张照片分别对应正面和反面，确认后将一起识别。</p>
          </div>
          <button
            type="button"
            class="dialog-close"
            aria-label="关闭"
            @click="closeDocumentPairDialog"
          >
            ×
          </button>
        </div>

        <div class="document-pair-grid">
          <div v-for="item in documentPairItems" :key="item.id" class="document-pair-item">
            <img :src="item.previewUrl" :alt="pairSideLabel(item.side)" />
            <div class="document-pair-meta">
              <strong>{{ pairSideLabel(item.side) }}</strong>
              <span>{{ item.file.name }}</span>
              <small>{{ formatFileSize(item.file.size) }}</small>
            </div>
          </div>
          <button
            v-if="documentPairItems.length < 2"
            type="button"
            class="document-pair-item document-pair-item--missing"
            @click="openMissingDocumentPair"
          >
            <span>＋</span>
            <strong>选择另一面</strong>
          </button>
        </div>

        <div class="document-pair-tools">
          <span>
            {{
              documentPairItems.length < 2
                ? '也可以直接从剪贴板粘贴另一面图片。'
                : '如果正反面顺序选反，可以直接交换。'
            }}
          </span>
          <button v-if="documentPairItems.length === 2" type="button" @click="swapDocumentSides">
            交换正反面
          </button>
        </div>

        <div class="dialog-actions">
          <button type="button" class="pq-btn pq-btn--cancel" @click="closeDocumentPairDialog">
            重新选择
          </button>
          <button
            type="button"
            class="pq-btn pq-btn--primary"
            :disabled="!documentPairReady || documentPairBusy"
            @click="submitDocumentPair"
          >
            {{ documentPairBusy ? '正在识别...' : '确认并识别' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showRollbackDialog" class="modal-backdrop" @click.self="showRollbackDialog = false">
      <section
        class="dialog-card rollback-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rollback-title"
      >
        <div class="dialog-heading">
          <div>
            <div id="rollback-title" class="dialog-title">回退业务流程</div>
            <p>请选择要返回的阶段。目标阶段之后的报价、核保和支付数据会自动失效。</p>
          </div>
          <button
            type="button"
            class="dialog-close"
            aria-label="关闭回退面板"
            @click="showRollbackDialog = false"
          >
            ×
          </button>
        </div>

        <div class="rollback-step-list">
          <button
            v-for="phase in rollbackTargets"
            :key="phase"
            type="button"
            class="rollback-step"
            :class="{ active: selectedRollbackPhase === phase }"
            @click="selectedRollbackPhase = phase"
          >
            <strong>{{ PHASE_LABELS[phase] }}</strong>
            <span>{{ rollbackImpactLabel(phase) }}</span>
          </button>
        </div>

        <div class="rollback-warning">
          已真实支付成功、已生成保单或存在待处理支付订单时，系统会禁止回退。
        </div>

        <div class="dialog-actions">
          <button type="button" class="pq-btn pq-btn--cancel" @click="showRollbackDialog = false">
            取消
          </button>
          <button
            type="button"
            class="pq-btn pq-btn--primary"
            :disabled="!selectedRollbackPhase || rollbackBusy"
            @click="performRollback"
          >
            {{ rollbackBusy ? '正在回退...' : '确认回退' }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="showChatHistory" class="modal-backdrop" @click.self="showChatHistory = false">
      <section
        class="chat-history-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-history-title"
      >
        <div class="chat-history-header">
          <div>
            <h3 id="chat-history-title">会话记录</h3>
            <p>选择一条记录即可恢复阶段、方案和聊天记忆。</p>
          </div>
          <button
            type="button"
            class="dialog-close"
            aria-label="关闭会话记录"
            @click="showChatHistory = false"
          >
            ×
          </button>
        </div>

        <div class="chat-history-list">
          <div v-if="chatHistoryLoading" class="chat-history-empty">正在加载会话记录...</div>
          <template v-else>
            <div
              v-for="record in chatHistory"
              :key="record.session_id"
              class="chat-history-item"
              :class="{
                'chat-history-item--active': record.session_id === sessionStore.sessionId,
                'chat-history-item--selected': selectedHistoryIds.includes(record.session_id),
                'chat-history-item--busy': Boolean(switchingSessionId),
              }"
              role="button"
              tabindex="0"
              @click="switchChatSession(record)"
              @keydown.enter="switchChatSession(record)"
            >
              <div class="chat-history-item-main">
                <input
                  type="checkbox"
                  class="chat-history-select"
                  :checked="selectedHistoryIds.includes(record.session_id)"
                  :aria-label="`选择${record.plate || '该会话'}`"
                  @click.stop
                  @change="toggleHistorySelection(record.session_id)"
                />
                <strong>{{ record.plate || '未绑定车牌' }}</strong>
                <span class="chat-history-phase">{{ PHASE_LABELS[record.phase] }}</span>
                <span
                  v-if="record.session_id === sessionStore.sessionId"
                  class="chat-history-current"
                >
                  当前
                </span>
                <button
                  type="button"
                  class="chat-history-delete"
                  :aria-label="`删除${record.plate || '该会话'}`"
                  @click.stop="requestDeleteSession(record.session_id)"
                >
                  删除
                </button>
              </div>
              <p>{{ record.last_message || '暂无聊天内容' }}</p>
              <div class="chat-history-meta">
                <span>{{ formatHistoryTime(record.updated_at) }}</span>
                <span>{{ record.message_count }} 条记忆</span>
                <span v-if="record.plan_total">
                  总保费 ¥{{
                    Number(record.plan_total).toLocaleString('zh-CN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  }}
                </span>
                <span v-if="switchingSessionId === record.session_id">正在恢复...</span>
              </div>
            </div>
            <div v-if="chatHistory.length === 0" class="chat-history-empty">
              暂无会话记录。发送第一条消息后，会话会自动保存在这里。
            </div>
          </template>
        </div>

        <div v-if="pendingDeleteIds.length" class="chat-history-delete-confirm">
          <span>
            确认删除 {{ pendingDeleteIds.length }} 条会话记录？删除后无法从记录列表恢复。
          </span>
          <div>
            <button
              type="button"
              class="pq-btn pq-btn--cancel"
              :disabled="historyDeleteBusy"
              @click="pendingDeleteIds = []"
            >
              取消
            </button>
            <button
              type="button"
              class="pq-btn pq-btn--danger"
              :disabled="historyDeleteBusy"
              @click="executeDeleteSessions"
            >
              {{ historyDeleteBusy ? '正在删除...' : '确认删除' }}
            </button>
          </div>
        </div>
        <div v-else class="chat-history-footer">
          <div class="chat-history-selection">
            <button type="button" @click="toggleSelectAllHistory">
              {{
                chatHistory.length > 0 && selectedHistoryIds.length === chatHistory.length
                  ? '取消全选'
                  : '全选'
              }}
            </button>
            <span v-if="selectedHistoryIds.length">已选择 {{ selectedHistoryIds.length }} 条</span>
          </div>
          <div class="chat-history-footer-actions">
            <button
              type="button"
              class="pq-btn pq-btn--danger-ghost"
              :disabled="!selectedHistoryIds.length"
              @click="requestBatchDeleteSessions"
            >
              批量删除
            </button>
            <button type="button" class="pq-btn pq-btn--cancel" @click="loadChatHistory">
              刷新
            </button>
          </div>
        </div>
      </section>
    </div>

    <div
      v-if="previewAttachment"
      class="attachment-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="照片预览"
      @click.self="previewAttachment = null"
    >
      <div class="attachment-lightbox-card">
        <div class="attachment-lightbox-header">
          <div>
            <strong>{{ previewAttachment.label || previewAttachment.name }}</strong>
            <span>{{ previewAttachment.name }} · {{ formatFileSize(previewAttachment.size) }}</span>
          </div>
          <button type="button" aria-label="关闭预览" @click="previewAttachment = null">×</button>
        </div>
        <img
          v-if="previewAttachment.type.startsWith('image/')"
          :src="previewAttachment.previewUrl"
          :alt="previewAttachment.label || previewAttachment.name"
        />
        <video v-else :src="previewAttachment.previewUrl" controls autoplay />
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-view {
  max-width: 960px;
  margin: 0 auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  gap: 12px;
  width: 100%;
}

.cv-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  background: linear-gradient(135deg, var(--color-surface), #f8fbff);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--color-gray-200);
  position: sticky;
  top: 16px;
  z-index: 10;
  backdrop-filter: blur(8px);
}

.cv-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: var(--color-gray-900);
  background: linear-gradient(135deg, #1d4ed8, #3b82f6);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.cv-subtitle {
  display: inline-block;
  font-size: 12px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  padding: 2px 10px;
  border-radius: var(--radius-full);
  margin-left: 10px;
  font-weight: 500;
}

.cv-header-right {
  display: flex;
  gap: 8px;
}

.cv-header-btn {
  padding: 6px 14px;
  border: 1px solid var(--color-gray-300);
  background: var(--color-surface);
  border-radius: var(--radius-full);
  font-size: 12px;
  cursor: pointer;
  color: var(--color-gray-700);
  transition: all var(--transition-fast);
}

.cv-header-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.cv-header-btn:active {
  transform: scale(0.96);
}

.batch-query-panel {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: 14px;
  border: 1px solid var(--color-gray-200);
  box-shadow: var(--shadow-sm);
  animation: fade-up var(--transition-base) both;
}

.bq-textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  font-size: 13px;
  resize: vertical;
  box-sizing: border-box;
  outline: none;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.bq-textarea:focus {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-ring);
}

.bq-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.bq-btn {
  padding: 6px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
  border: none;
  transition: all var(--transition-fast);
}

.bq-btn:active {
  transform: scale(0.96);
}

.bq-btn--primary {
  background: var(--color-primary);
  color: #fff;
}

.bq-btn--primary:hover {
  background: var(--color-primary-hover);
}

.bq-btn--cancel {
  background: var(--color-gray-100);
  color: var(--color-gray-700);
}

.bq-btn--cancel:hover {
  background: var(--color-gray-200);
}

.bq-results {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bq-result-row {
  display: flex;
  gap: 12px;
  font-size: 12px;
  padding: 6px 10px;
  background: var(--color-gray-50);
  border-radius: var(--radius-sm);
}

.bq-phase {
  color: var(--color-primary);
  font-weight: 500;
}

.bq-status {
  margin-left: auto;
  color: var(--color-success);
}

.cv-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0.3));
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-gray-200);
}

.cv-empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--color-gray-400);
}

.cv-empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  animation: cv-bounce 2s ease-in-out infinite;
}

@keyframes cv-bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.cv-empty-text {
  font-size: 14px;
}

.plate-query-modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fade-in var(--transition-fast) both;
}

.pq-box {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: 24px;
  width: 360px;
  box-shadow: var(--shadow-lg);
  animation: pop-in var(--transition-base) both;
}

.pq-title {
  font-weight: 600;
  margin-bottom: 16px;
  font-size: 16px;
  color: var(--color-gray-900);
}

.pq-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  margin-bottom: 10px;
  font-size: 14px;
  box-sizing: border-box;
  outline: none;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.pq-input:focus {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-ring);
}

.pq-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.pq-btn {
  padding: 8px 18px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
  border: none;
  transition: all var(--transition-fast);
}

.pq-btn:active {
  transform: scale(0.96);
}

.pq-btn--primary {
  background: var(--color-primary);
  color: #fff;
}

.pq-btn--primary:hover {
  background: var(--color-primary-hover);
}

.pq-btn--cancel {
  background: var(--color-gray-100);
  color: var(--color-gray-700);
}

.pq-btn--cancel:hover {
  background: var(--color-gray-200);
}

.cv-phase-panel {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: 16px;
  border: 1px solid var(--color-gray-200);
  box-shadow: var(--shadow-sm);
  animation: fade-up var(--transition-base) both;
}

.plate-query-toggle {
  margin-top: 12px;
  padding: 8px 14px;
  background: transparent;
  border: 1px dashed var(--color-primary);
  color: var(--color-primary);
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
  width: 100%;
  transition: all var(--transition-fast);
}

.plate-query-toggle:hover {
  background: var(--color-primary-soft);
}

.verification-box {
  border: 1px solid #fecaca;
  background: var(--color-danger-soft);
  padding: 16px;
  border-radius: var(--radius-md);
}

.verification-title {
  font-weight: 600;
  color: #b91c1c;
  margin-bottom: 12px;
}

.verification-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.vf-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.vf-item label {
  color: var(--color-gray-700);
  min-width: 120px;
}

.verification-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.v-btn {
  padding: 8px 18px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
  border: none;
  transition: all var(--transition-fast);
}

.v-btn:active {
  transform: scale(0.96);
}

.v-btn--primary {
  background: var(--color-primary);
  color: #fff;
}

.v-btn--primary:hover {
  background: var(--color-primary-hover);
}

.v-btn--cancel {
  background: var(--color-surface);
  border: 1px solid var(--color-gray-300);
  color: var(--color-gray-700);
}

.v-btn--cancel:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.cv-input-area {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: 12px 16px;
  border: 1px solid var(--color-gray-200);
  box-shadow: var(--shadow-md);
  position: sticky;
  bottom: 16px;
}

.input-row {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.chat-input {
  flex: 1;
  padding: 10px 16px;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-full);
  font-size: 14px;
  outline: none;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.chat-input:focus {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-ring);
}

.send-btn {
  padding: 10px 24px;
  background: linear-gradient(135deg, var(--color-primary), var(--color-primary-hover));
  color: #fff;
  border: none;
  border-radius: var(--radius-full);
  font-size: 14px;
  cursor: pointer;
  font-weight: 500;
  box-shadow: var(--shadow-sm);
  transition: all var(--transition-fast);
}

.send-btn:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.send-btn:active {
  transform: translateY(0) scale(0.96);
}

@media (max-width: 768px) {
  .chat-view {
    padding: 8px;
    gap: 8px;
  }
  .cv-header {
    top: 8px;
    flex-wrap: wrap;
  }
  .cv-input-area {
    bottom: 8px;
  }
  .pq-box {
    width: calc(100vw - 32px);
  }
}
</style>

<style scoped>
/* Layout v2: keep the conversation scrollable while workflow controls stay visible. */
.chat-view {
  width: 100%;
  max-width: 980px;
  min-height: 0;
  height: 100%;
  margin: 0 auto;
  padding: 16px 20px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cv-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--shadow-sm);
  position: static;
  backdrop-filter: blur(10px);
}

.cv-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.cv-title-mark {
  display: block;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  object-fit: cover;
  border-radius: 12px;
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.24);
}

.cv-heading {
  min-width: 0;
}

.cv-title {
  overflow: hidden;
  color: var(--color-gray-900);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: none;
  -webkit-text-fill-color: currentColor;
}

.cv-subline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin-top: 2px;
}

.provider-api-warning {
  display: flex;
  width: min(1240px, calc(100% - 48px));
  align-items: center;
  gap: 10px;
  margin: 10px auto 0;
  padding: 9px 12px;
  border: 1px solid #fed7aa;
  border-radius: var(--radius-md);
  background: #fff7ed;
  color: #9a3412;
  font-size: 11px;
}

.provider-api-warning strong {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: var(--radius-full);
  background: #ffedd5;
  font-size: 10px;
}

.cv-subtitle {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  margin: 0;
  padding: 1px 9px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary-active);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.cv-session-caption {
  overflow: hidden;
  color: var(--color-gray-400);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cv-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.cv-header-btn {
  min-height: 34px;
  padding: 6px 13px;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-gray-700);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition:
    border-color var(--transition-fast),
    color var(--transition-fast),
    background var(--transition-fast);
}

.cv-header-btn:hover,
.cv-header-btn--active {
  border-color: #bfdbfe;
  background: var(--color-primary-soft);
  color: var(--color-primary-active);
}

.cv-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 14px;
  flex: 1;
  min-height: 0;
}

.cv-conversation {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
}

.cv-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(249, 250, 251, 0.82));
}

.cv-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  padding: 48px 20px;
}

.cv-empty-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  margin-bottom: 12px;
  border: 1px solid #dbeafe;
  border-radius: 16px;
  background: var(--color-primary-soft);
  font-size: 25px;
  animation: none;
}

.cv-empty-text {
  color: var(--color-gray-500);
  font-size: 13px;
}

.agent-question {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 4px;
  max-width: 100%;
}

.agent-question-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  border-radius: 10px;
  background: linear-gradient(135deg, #2563eb, #60a5fa);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  box-shadow: 0 5px 14px rgba(37, 99, 235, 0.2);
}

.agent-question-body {
  width: min(100% - 42px, 740px);
  padding: 13px 15px;
  border: 1px solid #dbeafe;
  border-radius: 4px var(--radius-lg) var(--radius-lg) var(--radius-lg);
  background: linear-gradient(145deg, #ffffff, #f7fbff);
  box-shadow: var(--shadow-sm);
}

.agent-question-title {
  color: var(--color-gray-900);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.5;
}

.agent-question-body > p {
  margin: 5px 0 0;
  color: var(--color-gray-500);
  font-size: 13px;
  line-height: 1.7;
}

.agent-question :deep(.quick-actions) {
  padding: 10px 0 0;
}

.chat-upload-action {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 11px;
  margin-top: 4px;
  padding: 12px 13px;
  border: 1px dashed #93c5fd;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, #f8fbff, var(--color-primary-soft));
}

.chat-upload-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #fff;
  box-shadow: var(--shadow-xs);
  font-size: 17px;
}

.chat-upload-copy {
  min-width: 0;
}

.chat-upload-copy strong {
  color: var(--color-gray-900);
  font-size: 12px;
}

.chat-upload-copy p {
  margin: 3px 0 0;
  color: var(--color-gray-500);
  font-size: 11px;
  line-height: 1.55;
}

.chat-upload-action > button {
  min-height: 34px;
  padding: 7px 12px;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #fff;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.chat-upload-action > button:hover {
  background: var(--color-primary-hover);
}

.agent-processing-avatar {
  animation: processing-glow 1.8s ease-in-out infinite;
}

.agent-processing-body {
  display: flex;
  align-items: center;
  gap: 8px;
  width: auto;
  padding: 11px 14px;
  background: linear-gradient(145deg, #f8fbff, #eef6ff);
  color: var(--color-primary-active);
  font-size: 12px;
  font-weight: 600;
}

.agent-processing-dots {
  display: flex;
  align-items: center;
  gap: 3px;
}

.agent-processing-dots i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  animation: processing-dot 1.1s ease-in-out infinite;
}

.agent-processing-dots i:nth-child(2) {
  animation-delay: 0.16s;
}

.agent-processing-dots i:nth-child(3) {
  animation-delay: 0.32s;
}

.agent-processing-stop {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  padding: 3px 8px;
  border: 1px solid #bfdbfe;
  border-radius: var(--radius-full);
  background: #fff;
  color: var(--color-primary-active);
  cursor: pointer;
  font-size: 10px;
  font-weight: 600;
}

.agent-processing-stop svg {
  width: 9px;
  height: 9px;
  fill: currentColor;
}

.agent-processing-stop:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.chat-retry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 12px;
  border: 1px solid #fecaca;
  border-radius: var(--radius-md);
  background: var(--color-danger-soft);
  color: var(--color-danger-ink);
  font-size: 11px;
}

.chat-retry button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 5px 10px;
  border: 1px solid #fca5a5;
  border-radius: var(--radius-sm);
  background: #fff;
  color: var(--color-danger);
  cursor: pointer;
  font-size: 10px;
  font-weight: 600;
}

.chat-retry button svg {
  width: 11px;
  height: 11px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@keyframes processing-dot {
  0%,
  80%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

@keyframes processing-glow {
  0%,
  100% {
    box-shadow: 0 5px 14px rgba(37, 99, 235, 0.18);
  }
  50% {
    box-shadow: 0 5px 22px rgba(37, 99, 235, 0.38);
  }
}

.cv-phase-panel {
  flex-shrink: 0;
  max-height: 248px;
  overflow-y: auto;
  padding: 14px;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-xs);
}

.cv-phase-panel :deep(.file-uploader) {
  padding: 0;
  border: 0;
  background: transparent;
}

.plate-query-toggle {
  width: 100%;
  margin-top: 10px;
  padding: 9px 14px;
  border: 1px solid #bfdbfe;
  border-radius: var(--radius-md);
  background: var(--color-primary-soft);
  color: var(--color-primary-active);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.plate-query-toggle:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-softer);
}

.cv-input-area {
  flex-shrink: 0;
  padding: 10px 14px 12px;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.07);
  position: static;
}

.cv-input-area :deep(.quick-actions) {
  padding: 0;
}

.staged-files {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}

.staged-file {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 220px;
  max-width: 100%;
  padding: 6px;
  border: 1px solid #dbeafe;
  border-radius: 12px;
  background: linear-gradient(135deg, #f8fbff, var(--color-primary-soft));
}

.staged-file-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  flex: 0 0 64px;
  overflow: hidden;
  border: 0;
  border-radius: 9px;
  background: #dbeafe;
  color: var(--color-primary);
  cursor: zoom-in;
  font-size: 25px;
}

.staged-file-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.staged-file-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.staged-file-copy strong {
  color: var(--color-gray-700);
  font-size: 11px;
}

.staged-file-copy small {
  overflow: hidden;
  max-width: 190px;
  color: var(--color-gray-400);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.staged-file-copy em {
  color: var(--color-primary-active);
  font-size: 9px;
  font-style: normal;
  font-weight: 500;
}

.staged-file-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex: 0 0 22px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.8);
  color: var(--color-gray-500);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
}

.staged-file-remove:hover {
  background: var(--color-danger-soft);
  color: var(--color-danger-ink);
}

.input-row {
  display: flex;
  gap: 8px;
  margin-top: 0;
}

.attach-btn {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  background: var(--color-gray-50);
  color: var(--color-gray-700);
  cursor: pointer;
  font-size: 24px;
  font-weight: 300;
  line-height: 1;
}

.attach-btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.attach-btn:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.chat-input {
  min-width: 0;
  flex: 1;
  min-height: 42px;
  padding: 9px 15px;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  font-size: 14px;
  outline: none;
}

.chat-input:focus {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-ring);
}

.send-btn {
  min-width: 76px;
  min-height: 42px;
  padding: 9px 20px;
  border: 0;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
}

.send-btn:hover {
  background: var(--color-primary-hover);
}

.send-btn:disabled {
  background: var(--color-gray-200);
  color: var(--color-gray-400);
  cursor: not-allowed;
}

.composer-hint {
  margin-top: 7px;
  padding-left: 2px;
  color: var(--color-gray-400);
  font-size: 10px;
}

.cv-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
}

.cv-side-card {
  padding: 16px;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: var(--shadow-xs);
}

.cv-side-card--guide {
  background: linear-gradient(145deg, rgba(239, 246, 255, 0.96), rgba(255, 255, 255, 0.98));
}

.cv-side-title {
  color: var(--color-gray-900);
  font-size: 14px;
  font-weight: 700;
}

.cv-side-kicker {
  margin-bottom: 4px;
  color: var(--color-primary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.cv-summary {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 10px 0 0;
}

.cv-summary > div {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--color-gray-100);
}

.cv-summary > div:last-child {
  border-bottom: 0;
}

.cv-summary dt {
  flex-shrink: 0;
  color: var(--color-gray-400);
  font-size: 12px;
}

.cv-summary dd {
  margin: 0;
  color: var(--color-gray-900);
  font-size: 12px;
  font-weight: 600;
  text-align: right;
  overflow-wrap: anywhere;
}

.cv-side-card p {
  margin: 8px 0 0;
  color: var(--color-gray-500);
  font-size: 12px;
  line-height: 1.65;
}

.cv-side-rule {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #dbeafe;
  color: var(--color-gray-500);
  font-size: 11px;
  line-height: 1.65;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.44);
  backdrop-filter: blur(4px);
  animation: fade-in var(--transition-fast) both;
}

.dialog-card {
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  padding: 20px;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-xl);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
  animation: pop-in var(--transition-base) both;
}

.dialog-card--wide {
  width: min(620px, calc(100vw - 32px));
}

.rollback-dialog {
  width: min(560px, calc(100vw - 32px));
}

.rollback-step-list {
  display: flex;
  max-height: 360px;
  flex-direction: column;
  gap: 7px;
  overflow-y: auto;
}

.rollback-step {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  cursor: pointer;
  text-align: left;
}

.rollback-step:hover,
.rollback-step.active {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.rollback-step strong {
  color: var(--color-gray-900);
  font-size: 13px;
}

.rollback-step span {
  color: var(--color-gray-500);
  font-size: 11px;
  line-height: 1.5;
}

.rollback-warning {
  margin-top: 12px;
  padding: 9px 11px;
  border: 1px solid #fed7aa;
  border-radius: var(--radius-sm);
  background: #fff7ed;
  color: #9a3412;
  font-size: 11px;
}

.cv-header-btn--rollback {
  border-color: #fdba74;
  color: #c2410c;
}

.cv-header-btn--rollback:hover {
  border-color: #f97316;
  background: #fff7ed;
  color: #c2410c;
}

.chat-history-panel {
  display: flex;
  width: min(660px, calc(100vw - 32px));
  max-height: min(760px, 88vh);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-xl);
  background: var(--color-surface);
  box-shadow: var(--shadow-xl);
}

.chat-history-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--color-gray-100);
}

.chat-history-header h3 {
  margin: 0;
  color: var(--color-gray-900);
  font-size: 18px;
}

.chat-history-header p {
  margin: 4px 0 0;
  color: var(--color-gray-500);
  font-size: 12px;
}

.chat-history-list {
  display: flex;
  min-height: 180px;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding: 14px;
  background: var(--color-gray-50);
}

.chat-history-item {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast),
    transform var(--transition-fast);
}

.chat-history-item:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-sm);
  transform: translateY(-1px);
}

.chat-history-item--active {
  border-color: #93c5fd;
  background: var(--color-primary-soft);
}

.chat-history-item--selected {
  border-color: #86efac;
  box-shadow: inset 0 0 0 1px #bbf7d0;
}

.chat-history-item--busy {
  pointer-events: none;
  opacity: 0.7;
}

.chat-history-item-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px;
}

.chat-history-item-main strong {
  color: var(--color-gray-900);
  font-size: 14px;
}

.chat-history-select {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.chat-history-phase,
.chat-history-current {
  padding: 2px 7px;
  border-radius: var(--radius-full);
  background: var(--color-gray-100);
  color: var(--color-gray-600);
  font-size: 10px;
}

.chat-history-current {
  background: var(--color-primary);
  color: #fff;
}

.chat-history-delete {
  flex-shrink: 0;
  margin-left: auto;
  padding: 2px 7px;
  border: 1px solid transparent;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-gray-400);
  cursor: pointer;
  font-size: 10px;
}

.chat-history-delete:hover {
  border-color: #fecaca;
  background: var(--color-danger-soft);
  color: var(--color-danger-ink);
}

.chat-history-item p {
  overflow: hidden;
  margin: 6px 0;
  color: var(--color-gray-600);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-history-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  color: var(--color-gray-400);
  font-size: 10px;
}

.chat-history-empty {
  padding: 42px 20px;
  color: var(--color-gray-400);
  text-align: center;
  font-size: 12px;
}

.chat-history-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-gray-100);
}

.chat-history-selection,
.chat-history-footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.chat-history-selection button {
  padding: 4px 8px;
  border: 0;
  border-radius: var(--radius-full);
  background: var(--color-gray-100);
  color: var(--color-gray-600);
  cursor: pointer;
  font-size: 11px;
}

.chat-history-selection span {
  color: var(--color-gray-500);
  font-size: 11px;
}

.pq-btn--danger,
.pq-btn--danger-ghost {
  background: var(--color-danger-soft);
  color: var(--color-danger-ink);
  border: 1px solid #fecaca;
}

.pq-btn--danger:hover,
.pq-btn--danger-ghost:hover {
  border-color: #fca5a5;
  background: #fee2e2;
}

.pq-btn--danger-ghost:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.chat-history-delete-confirm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 16px;
  border-top: 1px solid #fecaca;
  background: #fff7f7;
  color: var(--color-danger-ink);
  font-size: 12px;
}

.chat-history-delete-confirm > div {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

.dialog-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.dialog-title {
  color: var(--color-gray-900);
  font-size: 17px;
  font-weight: 700;
}

.dialog-heading p {
  margin: 4px 0 0;
  color: var(--color-gray-500);
  font-size: 12px;
}

.dialog-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border: 0;
  border-radius: 50%;
  background: var(--color-gray-100);
  color: var(--color-gray-500);
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
}

.dialog-close:hover {
  background: var(--color-gray-200);
  color: var(--color-gray-900);
}

.dialog-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dialog-fields label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--color-gray-700);
  font-size: 12px;
  font-weight: 600;
}

.pq-input {
  width: 100%;
  min-height: 42px;
  margin: 0;
  padding: 9px 12px;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-gray-900);
  font-size: 14px;
  font-weight: 400;
}

.pq-input:focus,
.bq-textarea:focus {
  border-color: var(--color-primary);
  outline: none;
  box-shadow: var(--shadow-ring);
}

.bq-textarea {
  width: 100%;
  min-height: 112px;
  padding: 11px 12px;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-gray-900);
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
}

.bq-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}

.bq-result-row {
  display: grid;
  grid-template-columns: minmax(92px, 0.8fr) minmax(110px, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 9px 11px;
  border: 1px solid var(--color-gray-100);
  border-radius: var(--radius-md);
  background: var(--color-gray-50);
  font-size: 12px;
}

.bq-plate {
  color: var(--color-gray-900);
  font-family: var(--font-mono);
  font-weight: 600;
}

.bq-phase {
  color: var(--color-primary);
  font-weight: 500;
}

.bq-status {
  color: var(--color-success);
  text-align: right;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.document-pair-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.document-pair-item {
  overflow: hidden;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-md);
  background: var(--color-gray-50);
}

.document-pair-item img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  background: var(--color-gray-100);
}

.document-pair-item--missing {
  display: flex;
  min-height: 190px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 2px dashed #bfdbfe;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  cursor: pointer;
}

.document-pair-item--missing span {
  font-size: 28px;
  font-weight: 300;
}

.document-pair-item--missing strong {
  font-size: 12px;
}

.document-pair-meta {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  padding: 9px 11px 11px;
}

.document-pair-meta strong {
  color: var(--color-gray-900);
  font-size: 12px;
}

.document-pair-meta span {
  overflow: hidden;
  color: var(--color-gray-500);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-pair-meta small {
  color: var(--color-gray-400);
  font-size: 9px;
}

.document-pair-tools {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  padding: 9px 11px;
  border-radius: var(--radius-md);
  background: var(--color-primary-soft);
  color: var(--color-gray-500);
  font-size: 11px;
}

.document-pair-tools button {
  flex-shrink: 0;
  padding: 5px 9px;
  border: 1px solid #93c5fd;
  border-radius: var(--radius-sm);
  background: #fff;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 10px;
  font-weight: 600;
}

.attachment-lightbox {
  position: fixed;
  inset: 0;
  z-index: 650;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(7, 15, 26, 0.82);
  backdrop-filter: blur(8px);
}

.attachment-lightbox-card {
  display: flex;
  width: min(1040px, 100%);
  max-height: calc(100vh - 48px);
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 18px;
  background: #111827;
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.45);
}

.attachment-lightbox-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 13px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.attachment-lightbox-header > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.attachment-lightbox-header strong {
  color: #fff;
  font-size: 13px;
}

.attachment-lightbox-header span {
  overflow: hidden;
  color: rgba(255, 255, 255, 0.56);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-lightbox-header button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
  font-size: 20px;
}

.attachment-lightbox-card img,
.attachment-lightbox-card video {
  display: block;
  width: 100%;
  min-height: 0;
  max-height: calc(100vh - 120px);
  object-fit: contain;
  background: #05080d;
}

.pq-btn {
  min-height: 38px;
  padding: 8px 18px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.pq-btn--primary {
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

.pq-btn--primary:hover {
  border-color: var(--color-primary-hover);
  background: var(--color-primary-hover);
}

.pq-btn--cancel {
  border: 1px solid var(--color-gray-300);
  background: var(--color-surface);
  color: var(--color-gray-700);
}

.pq-btn--cancel:hover {
  border-color: var(--color-gray-400);
  background: var(--color-gray-50);
}

.verification-box {
  padding: 14px;
  border: 1px solid #fecaca;
  border-radius: var(--radius-md);
  background: var(--color-danger-soft);
}

.verification-title {
  margin-bottom: 12px;
  color: #991b1b;
  font-size: 14px;
  font-weight: 700;
}

.verification-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.vf-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--color-gray-700);
  font-size: 12px;
}

.vf-item input {
  max-width: 100%;
  font-size: 12px;
}

.verification-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.v-btn {
  min-height: 36px;
  padding: 7px 16px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 12px;
}

.v-btn--primary {
  border: 1px solid var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

.v-btn--cancel {
  border: 1px solid var(--color-gray-300);
  background: var(--color-surface);
  color: var(--color-gray-700);
}

@media (max-width: 1024px) {
  .cv-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .cv-sidebar {
    display: none;
  }
}

@media (max-width: 768px) {
  .chat-view {
    padding: 8px;
    gap: 8px;
  }

  .cv-header {
    align-items: flex-start;
    padding: 10px 12px;
  }

  .cv-title-mark {
    display: none;
  }

  .cv-title {
    font-size: 16px;
  }

  .cv-session-caption {
    display: none;
  }

  .cv-header-btn {
    min-height: 32px;
    padding: 5px 10px;
  }

  .cv-messages {
    padding: 12px;
  }

  .cv-phase-panel {
    max-height: 270px;
    padding: 10px;
  }

  .cv-input-area {
    padding: 9px 10px 10px;
  }

  .chat-input,
  .bq-textarea {
    font-size: 16px;
  }

  .verification-fields {
    grid-template-columns: 1fr;
  }

  .chat-upload-action {
    grid-template-columns: 32px minmax(0, 1fr);
  }

  .chat-upload-action > button {
    grid-column: 1 / -1;
    width: 100%;
  }

  .document-pair-grid {
    grid-template-columns: 1fr;
  }

  .document-pair-tools {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 480px) {
  .cv-header {
    flex-wrap: wrap;
    gap: 8px;
  }

  .cv-header-left {
    width: 100%;
  }

  .cv-header-right {
    width: 100%;
  }

  .cv-header-btn {
    flex: 1;
  }

  .dialog-card {
    padding: 16px;
  }

  .chat-history-footer,
  .chat-history-delete-confirm {
    align-items: stretch;
    flex-direction: column;
  }

  .chat-history-footer-actions > button,
  .chat-history-delete-confirm > div > button {
    flex: 1;
  }

  .bq-result-row {
    grid-template-columns: 1fr auto;
  }

  .bq-phase {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
