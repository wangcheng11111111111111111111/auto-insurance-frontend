<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { AgentSessionSummary, SessionDetail, TakeoverRecord } from '../api/types'
import {
  agentGetSession,
  agentBatchCreate,
  agentBatchQuery,
  agentExportSessionsReport,
  agentListSessions,
  agentClaimTakeover,
  agentManualApplicant,
  agentManualVehicle,
  agentSendSessionMessage,
  agentSessionMessages,
  agentNotificationStream,
  agentResolveTakeover,
  agentTakeovers,
} from '../api'
import type { BatchResult } from '../api/types'
import type { ConversationMessage } from '../api/types'
import { PHASE_LABELS } from '../constants'
import { useUiStore } from '../stores/ui'
import { useAuthStore } from '../stores/auth'
import QuotationCard from '../components/business/QuotationCard.vue'
import PolicyCard from '../components/business/PolicyCard.vue'

const uiStore = useUiStore()
const authStore = useAuthStore()
const sessions = ref<AgentSessionSummary[]>([])
const selectedSessionId = ref('')
const detail = ref<SessionDetail | null>(null)
const takeovers = ref<TakeoverRecord[]>([])
const notificationCount = ref(0)
const newTicket = ref<Record<string, unknown> | null>(null)
const takeoverStatus = ref<'pending' | 'processing' | 'resolved' | 'all'>('pending')
const sidebarTab = ref<'takeovers' | 'sessions'>('takeovers')
const sessionSearch = ref('')
const hideEmptySessions = ref(true)
const takeoverCounts = ref({ pending: 0, processing: 0, resolved: 0 })
const activeTakeover = ref<TakeoverRecord | null>(null)
const resolveRemark = ref('')
const showResolveDialog = ref(false)
const takeoverBusyId = ref<number | null>(null)
const humanMessages = ref<ConversationMessage[]>([])
const humanMessageView = ref<'all' | 'human'>('all')
const humanMessageInput = ref('')
const sendingHumanMessage = ref(false)
const reviewSaving = ref(false)
const vehicleReviewForm = ref({
  license_plate: '',
  vin: '',
  brand_model: '',
  owner_name: '',
  registration_date: '',
  use_type: '非营运',
  seat_count: 5,
  vehicle_type: '小型轿车',
  engine_number: '',
})
const applicantReviewForm = ref({
  name: '',
  id_number: '',
})
const showBatchDialog = ref(false)
const batchMode = ref<'create' | 'query'>('create')
const batchText = ref('')
const batchBusy = ref(false)
const exportingReport = ref(false)
const batchResults = ref<BatchResult['results']>([])

let notificationStream: { close: () => void } | null = null
let conversationPollTimer: number | null = null

const selectedPhase = ref('all')
const phaseFilterOptions = [
  'all',
  'insurance_type_selection',
  'collecting_info',
  'recommending',
  'identity_verification',
  'quoting',
  'underwriting',
  'payment',
  'completed',
]

const filteredSessions = computed(() => {
  const keyword = sessionSearch.value.trim().toLowerCase()
  return sessions.value
    .filter((session) => {
      if (selectedPhase.value !== 'all' && session.phase !== selectedPhase.value) {
        return false
      }
      if (
        hideEmptySessions.value &&
        !session.plate &&
        !session.last_message &&
        !session.message_count
      ) {
        return false
      }
      if (!keyword) return true
      return [session.plate, session.session_id, session.last_message]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    })
    .sort((left, right) => (right.updated_at || '').localeCompare(left.updated_at || ''))
})

const takeoverSessionIds = computed(() => new Set(takeovers.value.map((item) => item.session_id)))

const visibleHumanMessages = computed(() =>
  humanMessageView.value === 'all'
    ? humanMessages.value
    : humanMessages.value.filter((message) => message.role !== 'assistant'),
)

const aiMessageCount = computed(
  () => humanMessages.value.filter((message) => message.role === 'assistant').length,
)

const humanMessageCount = computed(
  () =>
    humanMessages.value.filter((message) => message.role === 'customer' || message.role === 'agent')
      .length,
)

const canManualReview = computed(
  () =>
    activeTakeover.value?.handle_status === 'processing' &&
    activeTakeover.value.handler_id === authStore.user?.agent_id,
)

function reportError(error: unknown, message: string) {
  console.error(error)
  uiStore.showToast('error', (error as Error).message || message)
}

function phaseColor(phase: string) {
  const map: Record<string, string> = {
    insurance_type_selection: 'gray',
    collecting_info: 'blue',
    recommending: 'purple',
    identity_verification: 'yellow',
    quoting: 'cyan',
    underwriting: 'orange',
    payment: 'pink',
    completed: 'green',
  }
  return map[phase] ?? 'gray'
}

function formatWaiting(seconds: number) {
  if (!seconds) return '刚刚进入队列'
  if (seconds < 60) return `等待 ${seconds} 秒`
  if (seconds < 3600) return `等待 ${Math.floor(seconds / 60)} 分钟`
  return `等待 ${Math.floor(seconds / 3600)} 小时`
}

async function loadSessions() {
  try {
    const res = await agentListSessions()
    sessions.value = res.sessions
  } catch (e) {
    reportError(e, '会话列表加载失败')
  }
}

async function exportSessionsReport() {
  if (exportingReport.value) return
  exportingReport.value = true
  try {
    const blob = await agentExportSessionsReport(
      sidebarTab.value === 'takeovers'
        ? {
            phase: 'all',
            takeoverStatus: takeoverStatus.value,
            keyword: '',
            hideEmpty: false,
          }
        : {
            phase: selectedPhase.value,
            takeoverStatus: 'all',
            keyword: sessionSearch.value,
            hideEmpty: hideEmptySessions.value,
          },
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('-', '').slice(0, 15)
    link.href = url
    link.download = `业务员会话报表_${stamp}.xlsx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    uiStore.showToast('success', '会话报表已导出')
  } catch (e) {
    reportError(e, '报表导出失败')
  } finally {
    exportingReport.value = false
  }
}

async function selectSession(id: string) {
  selectedSessionId.value = id
  if (activeTakeover.value?.session_id !== id) {
    activeTakeover.value = takeovers.value.find((item) => item.session_id === id) ?? null
  }
  try {
    detail.value = await agentGetSession(id)
    syncReviewForms(detail.value)
    humanMessages.value = detail.value.conversation_messages || []
    await loadConversation()
  } catch (e) {
    reportError(e, '会话详情加载失败')
  }
}

function syncReviewForms(value: SessionDetail | null) {
  if (!value) return
  vehicleReviewForm.value = {
    license_plate: value.vehicle?.license_plate || value.plate || '',
    vin: value.vehicle?.vin || '',
    brand_model: value.vehicle?.brand_model || '',
    owner_name: value.vehicle?.owner_name || '',
    registration_date: value.vehicle?.registration_date?.slice(0, 10) || '',
    use_type: value.vehicle?.use_type || '非营运',
    seat_count: value.vehicle?.seat_count || 5,
    vehicle_type: value.vehicle?.vehicle_type || '小型轿车',
    engine_number: value.vehicle?.engine_number || '',
  }
  applicantReviewForm.value = {
    name: value.applicant?.name || '',
    id_number: value.applicant?.id_number?.replaceAll('*', '') || '',
  }
}

async function loadConversation() {
  if (!selectedSessionId.value) return
  try {
    const res = await agentSessionMessages(selectedSessionId.value)
    humanMessages.value = res.messages
  } catch {
    // Conversation polling retries while the session remains selected.
  }
}

async function sendHumanReply() {
  const content = humanMessageInput.value.trim()
  if (!content || sendingHumanMessage.value) return
  sendingHumanMessage.value = true
  try {
    const res = await agentSendSessionMessage(selectedSessionId.value, content)
    humanMessages.value.push(res.message_item)
    humanMessageInput.value = ''
  } catch (e) {
    reportError(e, '消息发送失败')
  } finally {
    sendingHumanMessage.value = false
  }
}

async function saveVehicleReview() {
  if (!selectedSessionId.value || reviewSaving.value) return
  reviewSaving.value = true
  try {
    await agentManualVehicle(selectedSessionId.value, {
      ...vehicleReviewForm.value,
      seat_count: Math.max(1, Number(vehicleReviewForm.value.seat_count) || 1),
    })
    await selectSession(selectedSessionId.value)
    await loadSessions()
    await loadTakeovers()
    uiStore.showToast('success', '车辆信息已人工核准并恢复智能推荐流程')
  } catch (e) {
    reportError(e, '车辆信息补录失败')
  } finally {
    reviewSaving.value = false
  }
}

async function saveApplicantReview() {
  if (!selectedSessionId.value || reviewSaving.value) return
  reviewSaving.value = true
  try {
    await agentManualApplicant(selectedSessionId.value, applicantReviewForm.value)
    await selectSession(selectedSessionId.value)
    await loadSessions()
    await loadTakeovers()
    uiStore.showToast('success', '投保人信息已人工核准并恢复报价流程')
  } catch (e) {
    reportError(e, '投保人信息补录失败')
  } finally {
    reviewSaving.value = false
  }
}

function formatMessageTime(value: string) {
  return value
    ? new Date(value).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
}

function messageRoleLabel(role: ConversationMessage['role']) {
  return {
    customer: '客户',
    agent: '业务员',
    assistant: '智能体',
    system: '系统',
  }[role]
}

async function loadTakeovers() {
  try {
    const res = await agentTakeovers(takeoverStatus.value, 50)
    takeovers.value = res.takeovers
    if (res.counts) takeoverCounts.value = res.counts
    if (selectedSessionId.value) {
      const selectedTakeover = res.takeovers.find(
        (item) => item.session_id === selectedSessionId.value,
      )
      if (selectedTakeover) activeTakeover.value = selectedTakeover
    }
    if (!selectedSessionId.value && sidebarTab.value === 'takeovers') {
      const firstActionable =
        res.takeovers.find((item) => item.handle_status === 'pending') ??
        res.takeovers.find((item) => item.handle_status === 'processing') ??
        res.takeovers[0]
      if (firstActionable) await openTakeoverSession(firstActionable)
    }
  } catch (e) {
    reportError(e, '人工工单加载失败')
  }
}

async function claimTakeover(t: TakeoverRecord) {
  if (takeoverBusyId.value !== null) return
  takeoverBusyId.value = t.id
  try {
    await agentClaimTakeover(t.id)
    activeTakeover.value = {
      ...t,
      handle_status: 'processing',
      handler_id: authStore.user?.agent_id || '',
    }
    takeoverStatus.value = 'processing'
    await selectSession(t.session_id)
    await loadTakeovers()
    uiStore.showToast('success', '工单已认领，可以由您继续处理')
  } catch (e) {
    reportError(e, '工单认领失败')
  } finally {
    takeoverBusyId.value = null
  }
}

async function openTakeoverSession(t: TakeoverRecord) {
  activeTakeover.value = t
  await selectSession(t.session_id)
}

function openResolveDialog(t: TakeoverRecord) {
  activeTakeover.value = t
  resolveRemark.value = ''
  showResolveDialog.value = true
}

async function resolveTakeover() {
  const takeover = activeTakeover.value
  if (!takeover || takeoverBusyId.value !== null) return
  takeoverBusyId.value = takeover.id
  try {
    await agentResolveTakeover(takeover.id, resolveRemark.value)
    showResolveDialog.value = false
    activeTakeover.value = null
    await loadTakeovers()
    await loadSessions()
    if (selectedSessionId.value === takeover.session_id) {
      await selectSession(takeover.session_id)
    }
    uiStore.showToast('success', '工单已办结，会话将回到智能体继续处理')
  } catch (e) {
    reportError(e, '工单办结失败')
  } finally {
    takeoverBusyId.value = null
  }
}

async function changeTakeoverStatus(status: typeof takeoverStatus.value) {
  takeoverStatus.value = status
  sidebarTab.value = 'takeovers'
  await loadTakeovers()
}

function switchSidebarTab(tab: 'takeovers' | 'sessions') {
  sidebarTab.value = tab
  if (tab === 'takeovers') void loadTakeovers()
  else void loadSessions()
}

function openBatchDialog(mode: 'create' | 'query') {
  batchMode.value = mode
  batchResults.value = []
  showBatchDialog.value = true
}

async function runBatchAction() {
  const plates = batchText.value
    .split(/[,，\n\s]+/)
    .map((plate) => plate.trim())
    .filter(Boolean)
  if (!plates.length || batchBusy.value) return

  batchBusy.value = true
  try {
    const res =
      batchMode.value === 'create'
        ? await agentBatchCreate(authStore.user?.agent_id || '', plates)
        : await agentBatchQuery(authStore.user?.agent_id || '', plates)
    batchResults.value = res.results
    await loadSessions()
    const firstSession = res.results.find((item) => item.session_id)?.session_id
    if (firstSession) await selectSession(firstSession)
    uiStore.showToast(
      'success',
      `${batchMode.value === 'create' ? '批量建单' : '批量查询'}完成，共 ${res.total} 个车牌`,
    )
  } catch (e) {
    uiStore.showToast('error', (e as Error).message)
  } finally {
    batchBusy.value = false
  }
}

function connectSSE() {
  notificationStream = agentNotificationStream(
    (data) => {
      if (data.type === 'connected') return
      if (data.type === 'new_ticket' || data.type === 'takeover') {
        notificationCount.value += 1
        newTicket.value = data
        loadTakeovers()
        loadSessions()
      }
      if (data.type === 'takeover_resolved') {
        loadTakeovers()
        loadSessions()
      }
    },
    (error) => console.warn('接管通知连接异常:', error.message),
  )
}

function dismissNotification() {
  notificationCount.value = 0
  newTicket.value = null
}

onMounted(() => {
  loadSessions()
  loadTakeovers()
  connectSSE()
  conversationPollTimer = window.setInterval(() => {
    if (selectedSessionId.value && detail.value?.phase === 'transferred_to_human') {
      void loadConversation()
    }
  }, 2000)
})

onUnmounted(() => {
  notificationStream?.close()
  if (conversationPollTimer !== null) {
    window.clearInterval(conversationPollTimer)
  }
})
</script>

<template>
  <div class="workspace">
    <aside class="ws-sidebar">
      <div class="ws-sidebar-header">
        <h2 class="ws-title">💼 业务员工作台</h2>
        <div class="ws-notification" :class="{ 'ws-notification--active': notificationCount > 0 }">
          🔔 {{ notificationCount > 0 ? notificationCount : '' }}
        </div>
      </div>

      <div class="ws-sidebar-tabs" role="tablist" aria-label="工作台导航">
        <button
          type="button"
          role="tab"
          :aria-selected="sidebarTab === 'takeovers'"
          :class="{ active: sidebarTab === 'takeovers' }"
          @click="switchSidebarTab('takeovers')"
        >
          接管工单
          <span>{{ takeoverCounts.pending + takeoverCounts.processing }}</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="sidebarTab === 'sessions'"
          :class="{ active: sidebarTab === 'sessions' }"
          @click="switchSidebarTab('sessions')"
        >
          全部会话
          <span>{{ filteredSessions.length }}</span>
        </button>
      </div>

      <template v-if="sidebarTab === 'takeovers'">
        <div class="ws-sidebar-controls">
          <select v-model="takeoverStatus" class="ws-filter-select" @change="loadTakeovers">
            <option value="pending">待认领</option>
            <option value="processing">处理中</option>
            <option value="resolved">已办结</option>
            <option value="all">全部工单</option>
          </select>
        </div>

        <div class="ws-queue-list">
          <div
            v-for="ticket in takeovers"
            :key="ticket.id"
            class="ws-queue-item"
            :class="{ 'ws-queue-item--active': ticket.session_id === selectedSessionId }"
            @click="openTakeoverSession(ticket)"
          >
            <div class="ws-queue-item-top">
              <strong>{{ ticket.plate || '未绑定车牌' }}</strong>
              <span
                class="ws-takeover-status"
                :class="`ws-takeover-status--${ticket.handle_status}`"
              >
                {{
                  ticket.handle_status === 'pending'
                    ? '待认领'
                    : ticket.handle_status === 'processing'
                      ? '处理中'
                      : '已办结'
                }}
              </span>
            </div>
            <p>{{ ticket.reason || '人工接管请求' }}</p>
            <div class="ws-queue-item-meta">
              <span>{{ formatWaiting(ticket.waiting_seconds) }}</span>
              <span>{{ ticket.handler_id || '未认领' }}</span>
            </div>
            <div class="ws-queue-item-actions" @click.stop>
              <button
                v-if="ticket.handle_status === 'pending'"
                type="button"
                class="ws-takeover-btn"
                :disabled="takeoverBusyId === ticket.id"
                @click="claimTakeover(ticket)"
              >
                {{ takeoverBusyId === ticket.id ? '认领中...' : '认领' }}
              </button>
              <button
                v-else-if="
                  ticket.handle_status === 'processing' &&
                  ticket.handler_id === authStore.user?.agent_id
                "
                type="button"
                class="ws-takeover-btn ws-takeover-btn--ghost"
                @click="openResolveDialog(ticket)"
              >
                办结
              </button>
              <span v-else class="ws-takeover-locked">
                {{ ticket.handle_status === 'resolved' ? '已办结' : '其他业务员处理中' }}
              </span>
            </div>
          </div>
          <div v-if="takeovers.length === 0" class="ws-empty">当前筛选下暂无工单</div>
        </div>
      </template>

      <template v-else>
        <div class="ws-sidebar-controls">
          <input
            v-model="sessionSearch"
            class="ws-search-input"
            type="search"
            placeholder="搜索车牌、会话ID或聊天内容"
          />
          <div class="ws-session-filters">
            <select v-model="selectedPhase" class="ws-filter-select">
              <option value="all">全部阶段</option>
              <option v-for="p in phaseFilterOptions.slice(1)" :key="p" :value="p">
                {{ PHASE_LABELS[p as keyof typeof PHASE_LABELS] ?? p }}
              </option>
            </select>
            <label class="ws-empty-session-toggle">
              <input v-model="hideEmptySessions" type="checkbox" />
              隐藏空会话
            </label>
          </div>
        </div>

        <div class="ws-session-list">
          <div
            v-for="session in filteredSessions"
            :key="session.session_id"
            class="ws-session"
            :class="{ 'ws-session--active': session.session_id === selectedSessionId }"
            @click="selectSession(session.session_id)"
          >
            <div class="ws-session-top">
              <span class="ws-session-plate">{{ session.plate || '未绑定车牌' }}</span>
              <span v-if="takeoverSessionIds.has(session.session_id)" class="ws-session-alert">
                人工
              </span>
              <span class="ws-phase-badge" :class="`ws-phase-badge--${phaseColor(session.phase)}`">
                {{ PHASE_LABELS[session.phase] ?? session.phase }}
              </span>
            </div>
            <div class="ws-session-preview">
              {{ session.last_message || '暂无对话记忆' }}
            </div>
            <div class="ws-session-bottom">
              <span class="ws-session-id">{{ session.session_id.slice(0, 8) }}...</span>
              <span v-if="session.message_count" class="ws-session-memory">
                {{ session.message_count }} 条记忆
              </span>
              <span v-if="session.plan_total" class="ws-session-total">
                ¥{{ Number(session.plan_total).toLocaleString() }}
              </span>
            </div>
          </div>
          <div v-if="filteredSessions.length === 0" class="ws-empty">暂无匹配会话</div>
        </div>
      </template>
    </aside>

    <main class="ws-main">
      <section class="ws-command-bar">
        <div>
          <div class="ws-command-title">业务工具</div>
          <p>批量创建车牌会话，或查询多台车当前所处阶段。</p>
        </div>
        <div class="ws-command-actions">
          <button
            type="button"
            class="ws-command-btn"
            :disabled="exportingReport"
            @click="exportSessionsReport"
          >
            {{ exportingReport ? '导出中...' : '导出报表' }}
          </button>
          <button type="button" class="ws-command-btn" @click="openBatchDialog('query')">
            批量查询
          </button>
          <button
            type="button"
            class="ws-command-btn ws-command-btn--primary"
            @click="openBatchDialog('create')"
          >
            批量建单
          </button>
        </div>
      </section>

      <section class="ws-metrics" aria-label="接管工单统计">
        <button
          type="button"
          class="ws-metric ws-metric--pending"
          :class="{ active: takeoverStatus === 'pending' }"
          @click="changeTakeoverStatus('pending')"
        >
          <span>待认领</span>
          <strong>{{ takeoverCounts.pending }}</strong>
        </button>
        <button
          type="button"
          class="ws-metric ws-metric--processing"
          :class="{ active: takeoverStatus === 'processing' }"
          @click="changeTakeoverStatus('processing')"
        >
          <span>处理中</span>
          <strong>{{ takeoverCounts.processing }}</strong>
        </button>
        <button
          type="button"
          class="ws-metric ws-metric--resolved"
          :class="{ active: takeoverStatus === 'resolved' }"
          @click="changeTakeoverStatus('resolved')"
        >
          <span>已办结</span>
          <strong>{{ takeoverCounts.resolved }}</strong>
        </button>
      </section>

      <div v-if="newTicket" class="ws-new-ticket" @click="dismissNotification">
        <span>🔔 新工单到达</span>
        <span class="ws-ticket-reason">{{ String(newTicket.reason ?? '人工接管请求') }}</span>
        <span class="ws-ticket-close">✕</span>
      </div>

      <template v-if="detail">
        <div class="ws-detail-header">
          <h3>会话详情</h3>
          <span class="ws-phase-badge" :class="`ws-phase-badge--${phaseColor(detail.phase)}`">
            {{ PHASE_LABELS[detail.phase] ?? detail.phase }}
          </span>
        </div>

        <section class="ws-human-chat">
          <div class="ws-human-chat-header">
            <div>
              <h4>
                {{ detail.phase === 'transferred_to_human' ? '人工会话' : '会话沟通记录' }}
              </h4>
              <p>
                {{
                  detail.phase === 'transferred_to_human'
                    ? '同步展示 AI 沟通记忆和人工消息，认领工单后可直接回复。'
                    : '展示客户与智能体的完整对话记忆，当前会话仅供查看。'
                }}
              </p>
            </div>
            <span
              v-if="detail.phase === 'transferred_to_human'"
              class="ws-takeover-status"
              :class="`ws-takeover-status--${activeTakeover?.handle_status || 'pending'}`"
            >
              {{
                activeTakeover?.handle_status === 'processing'
                  ? '由您处理'
                  : activeTakeover?.handle_status === 'resolved'
                    ? '已办结'
                    : '待认领'
              }}
            </span>
            <span v-else class="ws-takeover-status">AI 会话 · 只读</span>
          </div>

          <div class="ws-review-overview">
            <div class="ws-review-stats">
              <span
                ><strong>{{ aiMessageCount }}</strong> 条 AI 沟通</span
              >
              <span
                ><strong>{{ humanMessageCount }}</strong> 条人工消息</span
              >
              <span v-if="detail.phase === 'transferred_to_human'">
                <strong>{{ formatWaiting(activeTakeover?.waiting_seconds || 0) }}</strong>
              </span>
            </div>
            <div class="ws-message-filter">
              <button
                type="button"
                :class="{ active: humanMessageView === 'all' }"
                @click="humanMessageView = 'all'"
              >
                全部记录
              </button>
              <button
                type="button"
                :class="{ active: humanMessageView === 'human' }"
                @click="humanMessageView = 'human'"
              >
                {{ detail.phase === 'transferred_to_human' ? '只看人工' : '只看客户' }}
              </button>
            </div>
          </div>

          <div class="ws-human-messages">
            <div v-if="visibleHumanMessages.length === 0" class="ws-human-chat-empty">
              {{
                detail.phase === 'transferred_to_human'
                  ? '暂无沟通记录'
                  : '该会话暂无可恢复的 AI 聊天记录'
              }}
            </div>
            <div
              v-for="message in visibleHumanMessages"
              :key="message.id"
              class="ws-human-message"
              :class="`ws-human-message--${message.role}`"
            >
              <div class="ws-human-message-meta">
                <span>
                  {{ messageRoleLabel(message.role) }}
                  {{ message.sender_name ? `· ${message.sender_name}` : '' }}
                </span>
                <time>{{ formatMessageTime(message.created_at) }}</time>
              </div>
              <div class="ws-human-message-content">{{ message.content }}</div>
              <details
                v-if="message.metadata?.knowledge_sources?.length"
                class="ws-message-sources"
              >
                <summary>知识依据 {{ message.metadata.knowledge_sources.length }} 项</summary>
                <div
                  v-for="source in message.metadata.knowledge_sources"
                  :key="`${source.type}-${source.record_id}`"
                >
                  <strong>{{ source.title }}</strong>
                  <span
                    >{{ source.sheet }} {{ source.record_id ? `#${source.record_id}` : '' }}</span
                  >
                  <p>{{ source.excerpt }}</p>
                </div>
              </details>
            </div>
          </div>

          <form
            v-if="
              detail.phase === 'transferred_to_human' &&
              activeTakeover?.handle_status === 'processing' &&
              activeTakeover.handler_id === authStore.user?.agent_id
            "
            class="ws-human-chat-compose"
            @submit.prevent="sendHumanReply"
          >
            <textarea
              v-model="humanMessageInput"
              rows="2"
              maxlength="2000"
              placeholder="回复客户，例如：请补充发送行驶证副页..."
            />
            <button
              type="submit"
              class="ws-command-btn ws-command-btn--primary"
              :disabled="sendingHumanMessage || !humanMessageInput.trim()"
            >
              {{ sendingHumanMessage ? '发送中...' : '发送回复' }}
            </button>
          </form>
          <div v-else-if="detail.phase === 'transferred_to_human'" class="ws-human-chat-hint">
            {{
              activeTakeover?.handle_status === 'processing'
                ? '该工单由其他业务员处理中'
                : '请先在工单队列中认领此会话，再回复客户。'
            }}
          </div>
          <div v-else class="ws-human-chat-hint">
            当前会话由智能体处理中，聊天记录仅供业务员查看。
          </div>
        </section>

        <section
          v-if="detail.phase === 'transferred_to_human'"
          class="ws-review-tools"
          aria-label="人工审核补录"
        >
          <div class="ws-review-tools-heading">
            <div>
              <h4>人工审核与补录</h4>
              <p>OCR 或客户填写不完整时，由业务员核准后恢复智能体流程。</p>
            </div>
          </div>

          <template v-if="canManualReview">
            <details class="ws-review-detail">
              <summary>车辆信息不完整？人工补录</summary>
              <form class="ws-review-form" @submit.prevent="saveVehicleReview">
                <label>
                  <span>车牌号</span>
                  <input v-model="vehicleReviewForm.license_plate" required />
                </label>
                <label>
                  <span>车架号</span>
                  <input v-model="vehicleReviewForm.vin" maxlength="17" required />
                </label>
                <label>
                  <span>品牌型号</span>
                  <input v-model="vehicleReviewForm.brand_model" required />
                </label>
                <label>
                  <span>所有人</span>
                  <input v-model="vehicleReviewForm.owner_name" required />
                </label>
                <label>
                  <span>注册日期</span>
                  <input v-model="vehicleReviewForm.registration_date" type="date" />
                </label>
                <label>
                  <span>使用性质</span>
                  <input v-model="vehicleReviewForm.use_type" />
                </label>
                <label>
                  <span>座位数</span>
                  <input v-model.number="vehicleReviewForm.seat_count" type="number" min="1" />
                </label>
                <label>
                  <span>车辆类型</span>
                  <input v-model="vehicleReviewForm.vehicle_type" />
                </label>
                <label>
                  <span>发动机号</span>
                  <input v-model="vehicleReviewForm.engine_number" />
                </label>
                <button
                  type="submit"
                  class="ws-command-btn ws-command-btn--primary"
                  :disabled="reviewSaving"
                >
                  {{ reviewSaving ? '正在保存...' : '核准车辆信息' }}
                </button>
              </form>
            </details>

            <details class="ws-review-detail">
              <summary>投保人信息不完整？人工补录</summary>
              <form
                class="ws-review-form ws-review-form--applicant"
                @submit.prevent="saveApplicantReview"
              >
                <label>
                  <span>姓名</span>
                  <input v-model="applicantReviewForm.name" required />
                </label>
                <label>
                  <span>身份证号</span>
                  <input v-model="applicantReviewForm.id_number" maxlength="18" required />
                </label>
                <button
                  type="submit"
                  class="ws-command-btn ws-command-btn--primary"
                  :disabled="reviewSaving"
                >
                  {{ reviewSaving ? '正在保存...' : '核准投保人信息' }}
                </button>
              </form>
            </details>
          </template>
          <p v-else class="ws-review-locked">请先认领该工单，再进行人工信息核准与补录。</p>
        </section>

        <div class="ws-detail-grid">
          <div class="ws-card" v-if="detail.vehicle">
            <div class="ws-card-title">🚗 车辆信息</div>
            <div class="ws-kv">
              <span>车牌号</span><b>{{ detail.vehicle.license_plate }}</b>
            </div>
            <div class="ws-kv">
              <span>品牌型号</span><b>{{ detail.vehicle.brand_model }}</b>
            </div>
            <div class="ws-kv">
              <span>车架号</span><b>{{ detail.vehicle.vin }}</b>
            </div>
            <div class="ws-kv">
              <span>所有人</span><b>{{ detail.vehicle.owner_name }}</b>
            </div>
          </div>

          <div class="ws-card" v-if="detail.applicant">
            <div class="ws-card-title">👤 投保人</div>
            <div class="ws-kv">
              <span>姓名</span><b>{{ detail.applicant.name }}</b>
            </div>
            <div class="ws-kv">
              <span>身份证</span><b>{{ detail.applicant.id_number }}</b>
            </div>
          </div>
        </div>

        <QuotationCard
          v-if="detail.plan"
          :plan="detail.plan"
          :vehicle="detail.vehicle"
          :totalPremium="detail.plan.total_premium"
          :quotation="detail.quotation"
          readonly
        />

        <div class="ws-card" v-if="detail.underwriting">
          <div class="ws-card-title">🔍 核保状态</div>
          <div class="ws-kv">
            <span>状态</span><b>{{ detail.underwriting.status }}</b>
          </div>
          <div class="ws-kv">
            <span>说明</span><b>{{ detail.underwriting.message }}</b>
          </div>
        </div>

        <PolicyCard v-if="detail.policy" :policy="detail.policy" />
      </template>

      <div v-else class="ws-empty-detail">
        <div class="ws-empty-icon">👈</div>
        <p>
          {{ sidebarTab === 'takeovers' ? '当前筛选下没有待处理工单' : '请选择左侧会话查看详情' }}
        </p>
      </div>
    </main>

    <div v-if="showBatchDialog" class="ws-modal-backdrop" @click.self="showBatchDialog = false">
      <div class="ws-modal" role="dialog" aria-modal="true" aria-labelledby="batch-action-title">
        <div class="ws-modal-header">
          <div>
            <h3 id="batch-action-title">
              {{ batchMode === 'create' ? '批量创建会话' : '批量查询会话' }}
            </h3>
            <p>每行一个车牌号，也支持逗号或空格分隔。</p>
          </div>
          <button
            type="button"
            class="ws-modal-close"
            aria-label="关闭"
            @click="showBatchDialog = false"
          >
            ×
          </button>
        </div>
        <textarea
          v-model="batchText"
          class="ws-batch-textarea"
          rows="5"
          placeholder="京A12345&#10;沪B67890"
        />
        <div v-if="batchResults.length" class="ws-batch-results">
          <div v-for="item in batchResults" :key="item.plate" class="ws-batch-result">
            <span class="ws-batch-plate">{{ item.plate }}</span>
            <span class="ws-batch-phase">
              {{
                item.error || (PHASE_LABELS[item.phase as keyof typeof PHASE_LABELS] ?? item.phase)
              }}
            </span>
            <span class="ws-batch-state">{{ item.session_id ? '已处理' : '未生成' }}</span>
          </div>
        </div>
        <div class="ws-modal-actions">
          <button type="button" class="ws-command-btn" @click="showBatchDialog = false">
            关闭
          </button>
          <button
            type="button"
            class="ws-command-btn ws-command-btn--primary"
            :disabled="batchBusy || !batchText.trim()"
            @click="runBatchAction"
          >
            {{ batchBusy ? '处理中...' : batchMode === 'create' ? '开始建单' : '开始查询' }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="showResolveDialog" class="ws-modal-backdrop" @click.self="showResolveDialog = false">
      <div class="ws-modal" role="dialog" aria-modal="true" aria-labelledby="resolve-title">
        <div class="ws-modal-header">
          <div>
            <h3 id="resolve-title">办结人工接管工单</h3>
            <p>{{ activeTakeover?.plate || '未绑定车牌' }} · {{ activeTakeover?.reason }}</p>
          </div>
          <button
            type="button"
            class="ws-modal-close"
            aria-label="关闭"
            @click="showResolveDialog = false"
          >
            ×
          </button>
        </div>
        <label class="ws-resolve-field">
          <span>处理备注</span>
          <textarea
            v-model="resolveRemark"
            rows="4"
            maxlength="500"
            placeholder="记录已核实的信息、客户诉求或后续注意事项"
          />
        </label>
        <p class="ws-resolve-note">办结后，会话会恢复到转人工之前的业务阶段，继续由智能体处理。</p>
        <div class="ws-modal-actions">
          <button type="button" class="ws-command-btn" @click="showResolveDialog = false">
            取消
          </button>
          <button
            type="button"
            class="ws-command-btn ws-command-btn--primary"
            :disabled="takeoverBusyId !== null"
            @click="resolveTakeover"
          >
            {{ takeoverBusyId !== null ? '正在办结...' : '确认办结' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.workspace {
  display: flex;
  height: 100%;
  box-sizing: border-box;
}

.ws-sidebar {
  width: 320px;
  background: var(--color-surface);
  border-right: 1px solid var(--color-gray-200);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.ws-sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--color-gray-200);
  background: linear-gradient(135deg, #f8fbff, var(--color-primary-soft));
}

.ws-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
  color: var(--color-gray-900);
}

.ws-notification {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--color-gray-100);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--color-gray-500);
  transition: all var(--transition-base);
}

.ws-notification--active {
  background: var(--color-danger);
  color: #fff;
  box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.2);
  animation: ws-pulse 1s infinite;
}

.ws-sidebar-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--color-gray-100);
}

.ws-sidebar-tabs button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 6px;
  border: 0;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-gray-500);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.ws-sidebar-tabs button span {
  min-width: 18px;
  padding: 1px 5px;
  border-radius: var(--radius-full);
  background: var(--color-gray-100);
  color: var(--color-gray-500);
  font-size: 10px;
}

.ws-sidebar-tabs button.active {
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.ws-sidebar-tabs button.active span {
  background: var(--color-primary);
  color: #fff;
}

.ws-sidebar-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--color-gray-100);
}

.ws-search-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  font-size: 12px;
  outline: none;
}

.ws-search-input:focus {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-ring);
}

.ws-session-filters {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.ws-empty-session-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--color-gray-500);
  cursor: pointer;
  font-size: 10px;
  white-space: nowrap;
}

.ws-empty-session-toggle input {
  accent-color: var(--color-primary);
}

.ws-queue-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.ws-queue-item {
  margin-bottom: 7px;
  padding: 11px 12px;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.ws-queue-item:hover,
.ws-queue-item--active {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-xs);
}

.ws-queue-item--active {
  background: var(--color-primary-soft);
}

.ws-queue-item-top,
.ws-queue-item-meta,
.ws-queue-item-actions {
  display: flex;
  align-items: center;
}

.ws-queue-item-top {
  justify-content: space-between;
  gap: 8px;
}

.ws-queue-item-top strong {
  color: var(--color-gray-900);
  font-size: 13px;
}

.ws-queue-item p {
  overflow: hidden;
  margin: 7px 0 5px;
  color: var(--color-gray-600);
  font-size: 11px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-queue-item-meta {
  gap: 10px;
  color: var(--color-gray-400);
  font-size: 10px;
}

.ws-queue-item-actions {
  justify-content: flex-end;
  min-height: 24px;
  margin-top: 6px;
}

.ws-queue-item-actions .ws-takeover-btn {
  padding: 4px 12px;
  font-size: 11px;
}

.ws-session-alert {
  margin-left: auto;
  padding: 2px 6px;
  border-radius: var(--radius-full);
  background: var(--color-danger-soft);
  color: var(--color-danger-ink);
  font-size: 9px;
  font-weight: 600;
}

@keyframes ws-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.2);
  }
}

.ws-filter {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-gray-100);
}

.ws-filter-select {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  font-size: 13px;
  background: var(--color-surface);
  outline: none;
  color: var(--color-gray-700);
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.ws-filter-select:focus {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-ring);
}

.ws-session-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.ws-session {
  padding: 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  margin-bottom: 6px;
  border: 1px solid transparent;
  border-left: 3px solid transparent;
  transition: all var(--transition-fast);
}

.ws-session:hover {
  background: var(--color-gray-50);
  border-color: var(--color-gray-200);
  border-left-color: var(--color-gray-300);
  transform: translateX(2px);
}

.ws-session--active {
  background: var(--color-primary-soft);
  border-color: var(--color-primary);
  border-left-color: var(--color-primary);
  box-shadow: var(--shadow-xs);
}

.ws-session-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.ws-session-plate {
  font-weight: 600;
  color: var(--color-gray-900);
  font-size: 14px;
}

.ws-session-preview {
  overflow: hidden;
  margin-top: 3px;
  color: var(--color-gray-500);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-phase-badge {
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 500;
}

.ws-phase-badge--gray {
  background: var(--color-gray-100);
  color: #4b5563;
}
.ws-phase-badge--blue {
  background: var(--color-primary-softer);
  color: #1e40af;
}
.ws-phase-badge--purple {
  background: #ede9fe;
  color: #5b21b6;
}
.ws-phase-badge--yellow {
  background: var(--color-warning-soft);
  color: var(--color-warning-ink);
}
.ws-phase-badge--cyan {
  background: #cffafe;
  color: #155e75;
}
.ws-phase-badge--orange {
  background: #ffedd5;
  color: #9a3412;
}
.ws-phase-badge--pink {
  background: #fce7f3;
  color: #9d174d;
}
.ws-phase-badge--green {
  background: var(--color-success-soft);
  color: var(--color-success-ink);
}

.ws-session-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--color-gray-400);
}

.ws-session-memory {
  margin-left: auto;
  color: var(--color-primary);
}

.ws-session-total {
  color: #dc2626;
  font-weight: 600;
}

.ws-empty {
  text-align: center;
  color: var(--color-gray-400);
  padding: 24px;
  font-size: 13px;
}

.ws-main {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: var(--color-gray-50);
}

.ws-main > * {
  width: min(1280px, 100%);
  margin-right: auto;
  margin-left: auto;
}

.ws-command-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
  padding: 10px 14px;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-xs);
}

.ws-command-title {
  color: var(--color-gray-900);
  font-size: 13px;
  font-weight: 700;
}

.ws-command-bar p {
  margin: 2px 0 0;
  color: var(--color-gray-500);
  font-size: 11px;
}

.ws-command-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.ws-command-btn {
  min-height: 34px;
  padding: 6px 14px;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-gray-700);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
}

.ws-command-btn--primary {
  border-color: var(--color-primary);
  background: var(--color-primary);
  color: #fff;
}

.ws-command-btn--primary:hover:not(:disabled) {
  border-color: var(--color-primary-hover);
  background: var(--color-primary-hover);
}

.ws-command-btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.ws-command-btn--primary:hover:not(:disabled) {
  color: #fff;
}

.ws-command-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ws-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 10px;
}

.ws-metric {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 54px;
  padding: 8px 12px;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-gray-600);
  cursor: pointer;
  box-shadow: var(--shadow-xs);
}

.ws-metric span {
  font-size: 12px;
}

.ws-metric strong {
  color: var(--color-gray-900);
  font-size: 21px;
  line-height: 1;
}

.ws-metric:hover,
.ws-metric.active {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}

.ws-metric--pending strong {
  color: #d97706;
}

.ws-metric--processing strong {
  color: var(--color-primary);
}

.ws-metric--resolved strong {
  color: var(--color-success);
}

.ws-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(15, 23, 42, 0.44);
  backdrop-filter: blur(4px);
}

.ws-modal {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  padding: 20px;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-xl);
  background: var(--color-surface);
  box-shadow: var(--shadow-lg);
}

.ws-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.ws-modal-header h3 {
  margin: 0;
  font-size: 17px;
}

.ws-modal-header p {
  margin: 4px 0 0;
  color: var(--color-gray-500);
  font-size: 12px;
}

.ws-modal-close {
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
}

.ws-batch-textarea {
  width: 100%;
  min-height: 120px;
  margin-top: 14px;
  padding: 10px 12px;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
}

.ws-batch-textarea:focus {
  border-color: var(--color-primary);
  outline: none;
  box-shadow: var(--shadow-ring);
}

.ws-batch-results {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
}

.ws-batch-result {
  display: grid;
  grid-template-columns: minmax(100px, 0.8fr) minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 9px 11px;
  border-radius: var(--radius-md);
  background: var(--color-gray-50);
  font-size: 12px;
}

.ws-batch-plate {
  font-family: var(--font-mono);
  font-weight: 600;
}

.ws-batch-phase {
  color: var(--color-gray-700);
}

.ws-batch-state {
  color: var(--color-success);
  text-align: right;
}

.ws-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.ws-new-ticket {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-danger-soft);
  border: 1px solid #fecaca;
  border-radius: var(--radius-md);
  margin-bottom: 16px;
  cursor: pointer;
  color: #b91c1c;
  font-weight: 500;
  animation: fade-up var(--transition-base) both;
}

.ws-ticket-reason {
  color: #7f1d1d;
  font-weight: 400;
}

.ws-ticket-close {
  margin-left: auto;
  opacity: 0.7;
}

.ws-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.ws-detail-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--color-gray-900);
}

.ws-human-chat {
  margin-bottom: 14px;
  overflow: hidden;
  border: 1px solid #bfdbfe;
  border-radius: var(--radius-lg);
  background: linear-gradient(145deg, #f8fbff, #eef6ff);
  box-shadow: var(--shadow-sm);
}

.ws-human-chat-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid #dbeafe;
}

.ws-human-chat-header h4 {
  margin: 0;
  color: var(--color-gray-900);
  font-size: 14px;
}

.ws-human-chat-header p {
  margin: 3px 0 0;
  color: var(--color-gray-500);
  font-size: 11px;
}

.ws-review-overview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 16px;
  border-bottom: 1px solid #dbeafe;
  background: rgba(255, 255, 255, 0.65);
}

.ws-review-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  color: var(--color-gray-500);
  font-size: 11px;
}

.ws-review-stats strong {
  color: var(--color-gray-800);
}

.ws-message-filter {
  display: flex;
  gap: 4px;
  padding: 3px;
  border-radius: var(--radius-full);
  background: var(--color-gray-100);
}

.ws-message-filter button {
  padding: 4px 9px;
  border: 0;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-gray-500);
  cursor: pointer;
  font-size: 11px;
}

.ws-message-filter button.active {
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: var(--shadow-xs);
}

.ws-human-messages {
  display: flex;
  max-height: 320px;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  padding: 16px;
}

.ws-human-chat-empty {
  padding: 24px;
  color: var(--color-gray-400);
  text-align: center;
  font-size: 12px;
}

.ws-human-message {
  display: flex;
  max-width: 78%;
  flex-direction: column;
  gap: 4px;
}

.ws-human-message--agent {
  align-self: flex-end;
  align-items: flex-end;
}

.ws-human-message--assistant {
  align-self: flex-start;
}

.ws-human-message--system {
  align-self: center;
  align-items: center;
  max-width: 90%;
}

.ws-human-message-meta {
  display: flex;
  gap: 8px;
  color: var(--color-gray-400);
  font-size: 10px;
}

.ws-human-message-content {
  padding: 9px 12px;
  border: 1px solid var(--color-gray-200);
  border-radius: 4px 12px 12px;
  background: var(--color-surface);
  color: var(--color-gray-900);
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.ws-human-message--agent .ws-human-message-content {
  border-color: var(--color-primary);
  border-radius: 12px 4px 12px 12px;
  background: var(--color-primary);
  color: #fff;
}

.ws-human-message--assistant .ws-human-message-content {
  border-color: #dbeafe;
  background: #f8fbff;
  color: var(--color-gray-800);
}

.ws-human-message--system .ws-human-message-content {
  border-color: #fde68a;
  border-radius: var(--radius-full);
  background: var(--color-warning-soft);
  color: var(--color-warning-ink);
  font-size: 11px;
}

.ws-message-sources {
  margin-top: 4px;
  border: 1px solid #dbeafe;
  border-radius: var(--radius-sm);
  background: #f8fbff;
}

.ws-message-sources summary {
  padding: 5px 8px;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 10px;
}

.ws-message-sources > div {
  display: grid;
  gap: 2px;
  padding: 6px 8px;
  border-top: 1px solid #e2e8f0;
}

.ws-message-sources strong {
  color: var(--color-gray-700);
  font-size: 10px;
}

.ws-message-sources span {
  color: var(--color-gray-400);
  font-size: 9px;
}

.ws-message-sources p {
  margin: 2px 0 0;
  color: var(--color-gray-600);
  font-size: 10px;
  line-height: 1.45;
}

.ws-human-chat-compose {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
  padding: 12px 16px 14px;
  border-top: 1px solid #dbeafe;
  background: rgba(255, 255, 255, 0.65);
}

.ws-human-chat-compose textarea {
  width: 100%;
  min-height: 54px;
  padding: 9px 11px;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
}

.ws-human-chat-compose textarea:focus {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-ring);
}

.ws-human-chat-hint {
  padding: 10px 16px 14px;
  border-top: 1px solid #dbeafe;
  color: var(--color-gray-500);
  font-size: 11px;
}

.ws-review-tools {
  margin-bottom: 14px;
  padding: 14px 16px;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
}

.ws-review-tools-heading h4 {
  margin: 0;
  color: var(--color-gray-900);
  font-size: 14px;
}

.ws-review-tools-heading p {
  margin: 3px 0 10px;
  color: var(--color-gray-500);
  font-size: 11px;
}

.ws-review-detail {
  border-top: 1px solid var(--color-gray-100);
}

.ws-review-detail summary {
  padding: 10px 0;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.ws-review-locked {
  margin: 0;
  padding: 12px;
  border-radius: var(--radius-sm);
  background: var(--color-warning-soft);
  color: var(--color-warning-ink);
  font-size: 12px;
}

.ws-review-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: end;
  gap: 10px;
  padding: 4px 0 12px;
}

.ws-review-form--applicant {
  grid-template-columns: repeat(2, minmax(0, 1fr)) auto;
}

.ws-review-form label {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.ws-review-form label span {
  color: var(--color-gray-500);
  font-size: 11px;
}

.ws-review-form input {
  min-width: 0;
  padding: 7px 9px;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-sm);
  outline: none;
  font-size: 12px;
}

.ws-review-form input:focus {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-ring);
}

.ws-detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}

.ws-card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: 14px;
  border: 1px solid var(--color-gray-200);
  margin-bottom: 12px;
  box-shadow: var(--shadow-xs);
}

.ws-card-title {
  font-weight: 600;
  color: var(--color-gray-700);
  margin-bottom: 10px;
  font-size: 14px;
}

.ws-kv {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
}

.ws-kv span {
  color: var(--color-gray-400);
}

.ws-kv b {
  color: var(--color-gray-900);
  font-weight: 500;
}

.ws-empty-detail {
  text-align: center;
  padding: 80px 20px;
  color: var(--color-gray-400);
}

.ws-empty-icon {
  font-size: 40px;
  animation: ws-empty-bounce 2s ease-in-out infinite;
}

@keyframes ws-empty-bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

.ws-takeovers {
  margin-top: 24px;
  border-top: 1px solid var(--color-gray-200);
  padding-top: 16px;
}

.ws-takeovers-title {
  font-size: 15px;
  color: var(--color-gray-900);
  margin: 0 0 12px;
}

.ws-takeovers-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.ws-takeovers-heading .ws-takeovers-title {
  margin-bottom: 2px;
}

.ws-takeovers-heading p {
  margin: 0;
  color: var(--color-gray-500);
  font-size: 12px;
}

.ws-takeover {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-surface);
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-md);
  margin-bottom: 8px;
  box-shadow: var(--shadow-xs);
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.ws-takeover:hover {
  border-color: var(--color-gray-300);
  box-shadow: var(--shadow-sm);
}

.ws-takeover-info {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.ws-takeover-main {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ws-takeover-plate {
  font-size: 15px;
  font-weight: 700;
}

.ws-takeover-status {
  padding: 2px 7px;
  border-radius: var(--radius-full);
  background: var(--color-gray-100);
  color: var(--color-gray-600);
  font-size: 10px;
  font-weight: 600;
}

.ws-takeover-status--pending {
  background: var(--color-warning-soft);
  color: var(--color-warning-ink);
}

.ws-takeover-status--processing {
  background: var(--color-primary-soft);
  color: var(--color-primary-active);
}

.ws-takeover-status--resolved {
  background: var(--color-success-soft);
  color: var(--color-success-ink);
}

.ws-takeover-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.ws-takeover-reason {
  font-weight: 500;
  color: var(--color-gray-900);
  font-size: 14px;
}

.ws-takeover-meta {
  display: flex;
  gap: 16px;
  font-size: 11px;
  color: var(--color-gray-400);
  margin-top: 4px;
}

.ws-takeover-btn {
  padding: 6px 18px;
  background: var(--color-success);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 13px;
  transition: all var(--transition-fast);
}

.ws-takeover-btn:hover {
  background: var(--color-success-hover);
  box-shadow: var(--shadow-sm);
}

.ws-takeover-btn:active {
  transform: scale(0.96);
}

.ws-takeover-btn:disabled {
  cursor: wait;
  opacity: 0.55;
}

.ws-takeover-btn--ghost {
  background: var(--color-surface);
  border: 1px solid var(--color-gray-300);
  color: var(--color-gray-600);
}

.ws-takeover-locked {
  color: var(--color-gray-400);
  font-size: 11px;
}

.ws-resolve-field {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 16px;
}

.ws-resolve-field > span {
  color: var(--color-gray-700);
  font-size: 12px;
  font-weight: 600;
}

.ws-resolve-field textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
  outline: none;
}

.ws-resolve-field textarea:focus {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-ring);
}

.ws-resolve-note {
  margin: 10px 0 0;
  color: var(--color-gray-500);
  font-size: 11px;
}

@media (max-width: 768px) {
  .workspace {
    flex-direction: column;
  }
  .ws-sidebar {
    width: 100%;
    height: 40vh;
  }
  .ws-detail-grid {
    grid-template-columns: 1fr;
  }

  .ws-human-message {
    max-width: 92%;
  }

  .ws-human-chat-compose {
    grid-template-columns: 1fr;
  }

  .ws-review-overview {
    align-items: flex-start;
    flex-direction: column;
  }

  .ws-review-form,
  .ws-review-form--applicant {
    grid-template-columns: 1fr;
  }

  .ws-command-bar {
    align-items: flex-start;
    flex-direction: column;
  }

  .ws-command-actions {
    width: 100%;
  }

  .ws-metrics {
    grid-template-columns: 1fr;
  }

  .ws-takeover {
    align-items: flex-start;
    flex-direction: column;
  }

  .ws-takeover-actions {
    width: 100%;
  }

  .ws-takeover-btn {
    flex: 1;
  }

  .ws-command-btn {
    flex: 1;
  }

  .ws-batch-result {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .ws-batch-phase {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
