<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { ChatAttachment, ChatMessage } from '../../api/types'
import QuotationCard from '../business/QuotationCard.vue'
import PolicyCard from '../business/PolicyCard.vue'
import PaymentPanel from '../business/PaymentPanel.vue'

const props = defineProps<{
  message: ChatMessage
  planArchived?: boolean
  canRetry?: boolean
}>()

const emit = defineEmits<{
  (e: 'confirmPlan'): void
  (e: 'modifyPlan', text: string): void
  (e: 'confirmQuotation'): void
  (e: 'verifyPayment'): void
  (e: 'resumeFlow'): void
  (e: 'retryMessage'): void
  (e: 'previewAttachment', attachment: ChatAttachment): void
}>()

const planCard = computed(
  () => props.message.structured?.quotation?.plan ?? props.message.structured?.plan ?? null,
)

const planVehicle = computed(
  () => props.message.structured?.quotation?.vehicle ?? props.message.structured?.vehicle ?? null,
)

const isQuotation = computed(() => Boolean(props.message.structured?.quotation))
const knowledgeSources = computed(
  () =>
    props.message.structured?.knowledge_sources ??
    props.message.structured?.quotation?.knowledge_sources ??
    [],
)
const copied = ref(false)
let copyTimer: number | null = null

function confirmPlanCard() {
  if (isQuotation.value) {
    emit('confirmQuotation')
  } else {
    emit('confirmPlan')
  }
}

function formatTime(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function renderMessage(content: string) {
  const escaped = content
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

  return escaped
    .replace(/^#{1,3}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-*]\s+/gm, '• ')
    .replaceAll('\n', '<br>')
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function hasPolicy() {
  return props.message.structured?.policy ?? false
}
function hasPayment() {
  return props.message.structured?.payment ?? false
}

async function copyMessage() {
  try {
    await navigator.clipboard.writeText(props.message.content)
    copied.value = true
    if (copyTimer !== null) window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => {
      copied.value = false
      copyTimer = null
    }, 1500)
  } catch {
    // Clipboard permission can be denied by the browser.
  }
}

onBeforeUnmount(() => {
  if (copyTimer !== null) window.clearTimeout(copyTimer)
})
</script>

<template>
  <div class="message-bubble" :class="`message-bubble--${message.role}`">
    <div class="message-avatar">
      <template v-if="message.role === 'user'">👤</template>
      <template v-else-if="message.role === 'assistant'">🤖</template>
      <template v-else>ℹ️</template>
    </div>
    <div class="message-body">
      <div class="message-content" :class="{ 'message-content--plan-first': planCard }">
        <QuotationCard
          v-if="planCard"
          :plan="planCard"
          :vehicle="planVehicle"
          :totalPremium="planCard.total_premium"
          :quotation="message.structured?.quotation"
          :confirmLabel="isQuotation ? '确认报价并核保' : '确认方案'"
          :archived="planArchived"
          :readonly="planArchived"
          @confirm="confirmPlanCard"
          @modify="(text: string) => emit('modifyPlan', text)"
        />

        <template v-if="message.role === 'assistant'">
          <div
            class="markdown-text"
            :class="{ 'markdown-text--after-plan': planCard }"
            v-html="renderMessage(message.content)"
          />
        </template>
        <template v-else>
          <span>{{ message.content }}</span>
        </template>

        <details v-if="knowledgeSources.length" class="knowledge-sources">
          <summary>知识依据 {{ knowledgeSources.length }} 项</summary>
          <div class="knowledge-source-list">
            <div
              v-for="source in knowledgeSources"
              :key="`${source.type}-${source.sheet}-${source.record_id}`"
              class="knowledge-source-item"
            >
              <div>
                <strong>{{ source.title }}</strong>
                <span>
                  {{ source.sheet }}
                  {{ source.record_id ? `#${source.record_id}` : '' }}
                </span>
              </div>
              <p>{{ source.excerpt }}</p>
            </div>
          </div>
        </details>

        <div v-if="message.structured?.attachments?.length" class="message-attachments">
          <button
            v-for="attachment in message.structured.attachments"
            :key="attachment.previewUrl"
            type="button"
            class="message-attachment"
            @click="emit('previewAttachment', attachment)"
          >
            <img
              v-if="attachment.type.startsWith('image/')"
              :src="attachment.previewUrl"
              :alt="attachment.name"
            />
            <span v-else class="message-attachment-video">🎬</span>
            <span class="message-attachment-meta">
              <strong>{{ attachment.label || attachment.name }}</strong>
              <small>{{ attachment.name }} · {{ formatFileSize(attachment.size) }}</small>
            </span>
          </button>
        </div>

        <PaymentPanel
          v-if="hasPayment() && message.structured?.payment"
          :payment="message.structured.payment"
          @verify="emit('verifyPayment')"
        />

        <PolicyCard
          v-if="hasPolicy() && message.structured?.policy"
          :policy="message.structured.policy"
        />

        <div v-if="message.structured?.needs_verification" class="verification-hint">
          该核保需要补充材料，请上传验车照片或视频。
        </div>
      </div>
      <div class="message-footer">
        <button
          type="button"
          class="message-copy"
          :aria-label="copied ? '消息已复制' : '复制消息'"
          @click="copyMessage"
        >
          <svg v-if="copied" class="message-action-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 12 4 4L19 6" />
          </svg>
          <svg v-else class="message-action-icon" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="8" y="8" width="11" height="11" rx="2" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
          </svg>
          <span>{{ copied ? '已复制' : '复制' }}</span>
        </button>
        <button
          v-if="canRetry"
          type="button"
          class="message-retry"
          aria-label="重新生成回答"
          @click="emit('retryMessage')"
        >
          <svg class="message-action-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 11a8 8 0 0 0-14.9-3" />
            <path d="M5 4v4h4" />
            <path d="M4 13a8 8 0 0 0 14.9 3" />
            <path d="M19 20v-4h-4" />
          </svg>
          <span>重试</span>
        </button>
        <span class="message-time">
          <svg class="message-time-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v4l2.5 1.5" />
          </svg>
          {{ formatTime(message.timestamp) }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-bubble {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  max-width: 100%;
  animation: fade-up var(--transition-base) both;
}

.message-bubble--user {
  flex-direction: row-reverse;
}

.message-bubble--system {
  justify-content: center;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
  background: var(--color-gray-100);
  box-shadow: var(--shadow-xs);
}

.message-bubble--user .message-avatar {
  background: var(--color-primary-softer);
}

.message-bubble--assistant .message-avatar {
  background: var(--color-warning-soft);
}

.message-bubble--system .message-avatar {
  display: none;
}

.message-body {
  min-width: 0;
  width: min(82%, 780px);
  max-width: min(82%, 780px);
  display: flex;
  flex-direction: column;
}

.message-bubble--assistant .message-content {
  align-self: flex-start;
}

.message-bubble--assistant .message-content:has(.quotation-card),
.message-bubble--assistant .message-content:has(.payment-panel),
.message-bubble--assistant .message-content:has(.policy-card) {
  width: 100%;
}

.message-bubble--user .message-body {
  width: auto;
  align-items: flex-end;
  max-width: 68%;
}

.message-bubble--system .message-body {
  align-items: center;
  max-width: 90%;
}

.message-content {
  max-width: 100%;
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  word-break: break-word;
  white-space: pre-wrap;
  line-height: 1.6;
}

.message-content--plan-first {
  display: flex;
  flex-direction: column;
}

.message-content--plan-first :deep(.quotation-card) {
  margin-top: 0;
  margin-bottom: 10px;
}

.message-bubble--user .message-content {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #fff;
  border-bottom-right-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
}

.message-bubble--assistant .message-content {
  background: var(--color-surface);
  color: var(--color-gray-900);
  border: 1px solid var(--color-gray-200);
  border-bottom-left-radius: var(--radius-sm);
  box-shadow: var(--shadow-xs);
}

.message-bubble--system .message-content {
  background: var(--color-warning-soft);
  color: var(--color-warning-ink);
  border-radius: var(--radius-full);
  padding: 8px 20px;
  font-size: 13px;
  border: 1px solid #fde68a;
}

.markdown-text {
  margin: 0;
  line-height: 1.7;
  font-size: 14px;
  overflow-wrap: anywhere;
}

.markdown-text--after-plan {
  padding-top: 10px;
  border-top: 1px solid var(--color-gray-100);
}

.knowledge-sources {
  margin-top: 10px;
  border: 1px solid #dbeafe;
  border-radius: var(--radius-md);
  background: #f8fbff;
}

.knowledge-sources summary {
  padding: 7px 10px;
  color: var(--color-primary);
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
}

.knowledge-source-list {
  display: flex;
  max-height: 260px;
  flex-direction: column;
  gap: 7px;
  overflow-y: auto;
  padding: 0 10px 10px;
}

.knowledge-source-item {
  padding: 8px 9px;
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}

.knowledge-source-item > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.knowledge-source-item strong {
  color: var(--color-gray-800);
  font-size: 11px;
}

.knowledge-source-item span {
  flex-shrink: 0;
  color: var(--color-gray-400);
  font-size: 9px;
}

.knowledge-source-item p {
  margin: 4px 0 0;
  color: var(--color-gray-600);
  font-size: 10px;
  line-height: 1.55;
}

.message-time {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--color-gray-400);
  padding: 0 4px;
}

.message-time-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.message-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.message-bubble--user .message-footer {
  flex-direction: row-reverse;
}

.message-bubble--system .message-footer {
  justify-content: center;
}

.message-copy,
.message-retry {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-height: 22px;
  padding: 2px 6px;
  border: 0;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-gray-400);
  cursor: pointer;
  font-size: 10px;
  opacity: 0;
  transition:
    opacity var(--transition-fast),
    color var(--transition-fast),
    background var(--transition-fast);
}

.message-bubble:hover .message-copy,
.message-bubble:hover .message-retry,
.message-copy:focus-visible,
.message-retry:focus-visible {
  opacity: 1;
}

.message-copy:hover,
.message-retry:hover {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.message-action-icon,
.message-time-icon {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.message-action-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

.message-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 9px;
}

.message-attachment {
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: 100%;
  padding: 5px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.14);
  color: inherit;
  cursor: zoom-in;
  text-align: left;
}

.message-attachment img {
  width: 112px;
  height: 78px;
  object-fit: cover;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.18);
}

.message-attachment-video {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 112px;
  height: 78px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.18);
  font-size: 26px;
}

.message-attachment-meta {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  padding-right: 5px;
}

.message-attachment-meta strong {
  overflow: hidden;
  max-width: 140px;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-attachment-meta small {
  color: rgba(255, 255, 255, 0.72);
  font-size: 10px;
}

.verification-hint {
  margin-top: 12px;
  padding: 10px 14px;
  background: var(--color-danger-soft);
  border: 1px solid #fecaca;
  border-radius: var(--radius-md);
  color: #b91c1c;
  font-size: 13px;
}

@media (max-width: 720px) {
  .message-bubble {
    gap: 8px;
  }

  .message-avatar {
    width: 30px;
    height: 30px;
    font-size: 16px;
  }

  .message-body,
  .message-bubble--user .message-body,
  .message-bubble--system .message-body {
    max-width: calc(100% - 38px);
    width: calc(100% - 38px);
  }

  .message-bubble--user .message-body {
    align-items: flex-end;
  }

  .message-content {
    padding: 10px 12px;
  }

  .message-bubble--user .message-content {
    width: fit-content;
  }

  .message-copy,
  .message-retry {
    opacity: 1;
  }
}
</style>
