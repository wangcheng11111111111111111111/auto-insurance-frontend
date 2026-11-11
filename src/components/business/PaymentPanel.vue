<script setup lang="ts">
import type { PaymentResult } from '../../api/types'

defineProps<{
  payment: PaymentResult
}>()

const emit = defineEmits<{
  (e: 'verify'): void
}>()

function copyLink(url: string) {
  navigator.clipboard?.writeText(url).catch(() => {
    // ignore
  })
}

function statusText(s: string) {
  const map: Record<string, string> = {
    pending: '待支付',
    processing: '支付处理中',
    success: '支付成功 ✅',
    failed: '支付失败 ❌',
  }
  return map[s] ?? s
}
</script>

<template>
  <div class="payment-panel">
    <div class="pp-header">
      <div class="pp-icon">💳</div>
      <div class="pp-title">支付订单</div>
      <div class="pp-status" :class="`pp-status--${payment.status}`">
        {{ statusText(payment.status) }}
      </div>
    </div>

    <div class="pp-info">
      <div class="pp-row">
        <span class="pp-label">订单号</span>
        <span class="pp-value">{{ payment.transaction_id || '—' }}</span>
      </div>
      <div class="pp-row">
        <span class="pp-label">应付金额</span>
        <span class="pp-value pp-value--amount"
          >¥{{ Number(payment.paid_amount).toLocaleString() }}</span
        >
      </div>
      <div class="pp-row" v-if="payment.paid_at">
        <span class="pp-label">支付时间</span>
        <span class="pp-value">{{ new Date(payment.paid_at).toLocaleString() }}</span>
      </div>
    </div>

    <template v-if="payment.status === 'pending' && payment.payment_url">
      <div class="pp-link">
        <div class="pp-link-label">支付链接</div>
        <div class="pp-link-box">
          <input type="text" :value="payment.payment_url" readonly class="pp-link-input" />
          <button type="button" class="pp-link-copy" @click="copyLink(payment.payment_url)">
            📋
          </button>
        </div>
      </div>
      <div class="pp-actions">
        <a
          :href="payment.payment_url"
          target="_blank"
          rel="noopener"
          class="pp-btn pp-btn--primary"
        >
          前往支付 →
        </a>
        <button type="button" class="pp-btn pp-btn--secondary" @click="emit('verify')">
          我已完成支付，核验结果
        </button>
      </div>
    </template>

    <div v-if="payment.status === 'success'" class="pp-success">
      <div class="pp-success-icon">🎉</div>
      <div class="pp-success-text">支付成功，稍后将为您生成保单</div>
    </div>
  </div>
</template>

<style scoped>
.payment-panel {
  margin-top: 16px;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  animation: pop-in var(--transition-base) both;
}

.pp-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
  border-bottom: 1px solid var(--color-gray-200);
}

.pp-icon {
  font-size: 24px;
}

.pp-title {
  flex: 1;
  font-weight: 600;
  color: var(--color-gray-900);
}

.pp-status {
  padding: 4px 10px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
}

.pp-status--pending {
  background: var(--color-warning-soft);
  color: var(--color-warning-ink);
}

.pp-status--processing {
  background: var(--color-primary-softer);
  color: #1e40af;
}

.pp-status--success {
  background: var(--color-success-soft);
  color: var(--color-success-ink);
}

.pp-status--failed {
  background: var(--color-danger-soft);
  color: var(--color-danger-ink);
}

.pp-info {
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-gray-100);
}

.pp-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 13px;
}

.pp-label {
  color: var(--color-gray-500);
}

.pp-value {
  color: var(--color-gray-900);
  font-weight: 500;
}

.pp-value--amount {
  color: #dc2626;
  font-size: 18px;
  font-weight: 700;
}

.pp-link {
  padding: 12px 16px;
}

.pp-link-label {
  font-size: 13px;
  color: var(--color-gray-500);
  margin-bottom: 6px;
}

.pp-link-box {
  display: flex;
  gap: 8px;
}

.pp-link-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--color-gray-700);
  background: var(--color-gray-50);
}

.pp-link-copy {
  padding: 8px 12px;
  border: 1px solid var(--color-gray-300);
  background: var(--color-surface);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.pp-link-copy:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.pp-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
}

.pp-btn {
  padding: 10px;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  text-align: center;
  text-decoration: none;
  border: none;
  transition: all var(--transition-fast);
}

.pp-btn:active {
  transform: scale(0.97);
}

.pp-btn--primary {
  background: var(--color-success);
  color: #fff;
}

.pp-btn--primary:hover {
  background: var(--color-success-hover);
  box-shadow: var(--shadow-sm);
}

.pp-btn--secondary {
  background: var(--color-surface);
  border: 1px solid var(--color-gray-300);
  color: var(--color-gray-700);
}

.pp-btn--secondary:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.pp-success {
  padding: 24px 16px;
  text-align: center;
}

.pp-success-icon {
  font-size: 42px;
  margin-bottom: 8px;
  animation: pop-in var(--transition-slow) both;
}

.pp-success-text {
  color: var(--color-success-hover);
  font-weight: 500;
}

@media (max-width: 640px) {
  .pp-row {
    align-items: flex-start;
    gap: 12px;
  }

  .pp-value {
    text-align: right;
    overflow-wrap: anywhere;
  }
}
</style>
