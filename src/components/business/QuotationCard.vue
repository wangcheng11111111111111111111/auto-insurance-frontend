<script setup lang="ts">
import { computed, ref } from 'vue'
import type { InsurancePlan, Quotation, VehicleInfo } from '../../api/types'
import { COMPANY_LOGOS, INSURANCE_NAMES } from '../../constants'

const props = withDefaults(
  defineProps<{
    plan: InsurancePlan | null
    vehicle: VehicleInfo | null
    totalPremium: string
    quotation?: Quotation | null
    confirmLabel?: string
    readonly?: boolean
    archived?: boolean
  }>(),
  {
    confirmLabel: '确认方案',
    archived: false,
  },
)

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'modify', text: string): void
}>()

const modifyText = ref('')
const showModifyInput = ref(false)
const showArchivedDetails = ref(false)
const totalLabel = computed(() => (props.quotation ? '报价总保费' : '方案预估'))

function totalItems() {
  return props.plan?.items.length ?? 0
}

function companyMark() {
  const label = COMPANY_LOGOS[props.plan?.company?.code ?? ''] ?? '保险'
  return label.replace(/保险|财险/g, '').slice(0, 2) || '保险'
}

function formatMoney(value: string | number | null | undefined) {
  const amount = Number(value)
  return Number.isFinite(amount)
    ? amount.toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '—'
}

function formatCoverage(value: string | number | null | undefined) {
  const amount = Number(value)
  return Number.isFinite(amount)
    ? amount.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
    : '—'
}

function formatValidUntil(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function sendModification() {
  const text = modifyText.value.trim()
  if (!text) return
  sendQuickModification(text)
}

function sendQuickModification(text: string) {
  emit('modify', text)
  modifyText.value = ''
  showModifyInput.value = false
}
</script>

<template>
  <div class="quotation-card" :class="{ 'quotation-card--archived': archived }" v-if="plan">
    <div class="qc-header">
      <div class="qc-company">
        <div class="qc-company-logo">
          {{ companyMark() }}
        </div>
        <div class="qc-company-info">
          <div class="qc-company-name">{{ plan.company?.name ?? '—' }}</div>
          <div class="qc-company-meta">
            <span>折扣率 {{ plan.discount_rate }}×</span>
            <span v-if="archived" class="qc-badge qc-badge--archived">历史方案</span>
            <span v-if="plan.is_last_year_plan" class="qc-badge qc-badge--year">去年方案</span>
            <span v-if="quotation" class="qc-badge qc-badge--quote">官方报价</span>
          </div>
        </div>
      </div>
      <div class="qc-total-compact">
        <span>{{ totalLabel }}</span>
        <strong>¥{{ formatMoney(totalPremium) }}</strong>
      </div>
    </div>

    <div v-if="quotation" class="qc-quote-meta">
      <span>报价版本 {{ quotation.version }}</span>
      <span v-if="quotation.valid_until">
        有效期至 {{ formatValidUntil(quotation.valid_until) }}
      </span>
      <span class="qc-rate-source">费率来源：{{ quotation.rate_source || '保司报价API' }}</span>
    </div>

    <div v-if="quotation?.validation_warnings?.length" class="qc-validation-warning">
      <strong>知识库规则提示</strong>
      <span v-for="warning in quotation.validation_warnings" :key="warning">
        {{ warning }}
      </span>
    </div>

    <div class="qc-actions" v-if="!readonly">
      <button
        type="button"
        class="qc-btn qc-btn--saving"
        @click="sendQuickModification('更优惠的方案')"
      >
        💡 更优惠
      </button>
      <button
        type="button"
        class="qc-btn qc-btn--secondary"
        @click="showModifyInput = !showModifyInput"
      >
        ✏️ 自定义
      </button>
      <button type="button" class="qc-btn qc-btn--primary" @click="emit('confirm')">
        ✅ {{ confirmLabel }}
      </button>
    </div>

    <div class="qc-modify" v-if="!readonly && showModifyInput">
      <div class="qc-quick-adjust">
        <span>快捷调整</span>
        <button type="button" @click="sendQuickModification('三者降到100万')">三者100万</button>
        <button type="button" @click="sendQuickModification('三者改到200万')">三者200万</button>
        <button type="button" @click="sendQuickModification('去掉车损险')">去掉车损</button>
        <button type="button" @click="sendQuickModification('换成太平洋保险')">换太平洋</button>
      </div>
      <input
        v-model="modifyText"
        type="text"
        class="qc-modify-input"
        placeholder="输入具体调整，例如：三者降到100万"
        @keyup.enter="sendModification"
      />
      <button type="button" class="qc-modify-btn" @click="sendModification">发送修改</button>
    </div>

    <div class="qc-vehicle" v-if="vehicle && (!archived || showArchivedDetails)">
      <span class="qc-vehicle-title">🚗</span>
      <span class="qc-vehicle-value">{{ vehicle.license_plate }}</span>
      <span class="qc-vehicle-divider">·</span>
      <span class="qc-vehicle-value qc-vehicle-value--model">{{ vehicle.brand_model }}</span>
    </div>

    <div class="qc-items" v-if="!archived || showArchivedDetails">
      <div class="qc-items-title">📋 险种明细（{{ totalItems() }} 项）</div>
      <div class="qc-items-list">
        <div v-for="item in plan.items" :key="item.code" class="qc-item">
          <div class="qc-item-name">
            <span class="qc-item-code">{{ INSURANCE_NAMES[item.code] ?? item.code }}</span>
          </div>
          <div class="qc-item-details">
            <span class="qc-item-coverage">保额 ¥{{ formatCoverage(item.coverage_amount) }}</span>
            <span class="qc-item-premium">保费 ¥{{ formatMoney(item.premium) }}</span>
          </div>
        </div>
      </div>
    </div>

    <button
      v-if="archived"
      type="button"
      class="qc-archive-toggle"
      @click="showArchivedDetails = !showArchivedDetails"
    >
      {{ showArchivedDetails ? '收起历史明细' : `查看历史明细（${totalItems()} 项）` }}
    </button>
  </div>
</template>

<style scoped>
.quotation-card {
  width: 100%;
  max-width: 760px;
  margin-top: 16px;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  animation: pop-in var(--transition-base) both;
}

.quotation-card--archived {
  max-width: 620px;
  opacity: 0.9;
  border-style: dashed;
  box-shadow: none;
}

.quotation-card--archived .qc-header {
  background: var(--color-gray-50);
}

.qc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: linear-gradient(135deg, var(--color-primary-soft), var(--color-primary-softer));
  border-bottom: 1px solid var(--color-gray-200);
}

.qc-company {
  display: flex;
  align-items: center;
  gap: 12px;
}

.qc-company-logo {
  width: 40px;
  height: 40px;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-gray-900);
  box-shadow: var(--shadow-xs);
}

.qc-company-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--color-gray-900);
}

.qc-company-discount {
  font-size: 12px;
  color: var(--color-gray-500);
}

.qc-company-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  color: var(--color-gray-500);
  font-size: 11px;
}

.qc-badge {
  padding: 2px 7px;
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 500;
}

.qc-badge--year {
  background: var(--color-warning-soft);
  color: var(--color-warning-ink);
}

.qc-badge--archived {
  background: var(--color-gray-200);
  color: var(--color-gray-600);
}

.qc-badge--quote {
  background: var(--color-success-soft);
  color: var(--color-success-ink);
}

.qc-quote-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 7px 12px;
  padding: 7px 14px;
  border-bottom: 1px solid var(--color-gray-100);
  background: #f8fbff;
  color: var(--color-gray-500);
  font-size: 10px;
}

.qc-rate-source {
  overflow: hidden;
  max-width: 320px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qc-validation-warning {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 7px 14px;
  border-bottom: 1px solid #fde68a;
  background: #fffbeb;
  color: #92400e;
  font-size: 10px;
}

.qc-validation-warning strong {
  width: 100%;
  font-size: 10px;
}

.qc-validation-warning span::before {
  content: '•';
  margin-right: 4px;
}

.qc-total-compact {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  flex-shrink: 0;
}

.qc-total-compact span {
  color: var(--color-gray-500);
  font-size: 10px;
}

.qc-total-compact strong {
  color: #b45309;
  font-size: 19px;
  line-height: 1.15;
}

.qc-vehicle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--color-gray-100);
  font-size: 12px;
  min-width: 0;
}

.qc-vehicle-title {
  flex-shrink: 0;
}

.qc-vehicle-value {
  color: var(--color-gray-900);
  font-weight: 500;
  white-space: nowrap;
}

.qc-vehicle-value--model {
  overflow: hidden;
  text-overflow: ellipsis;
}

.qc-vehicle-divider {
  color: var(--color-gray-300);
}

.qc-items {
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-gray-100);
}

.qc-items-title {
  font-size: 13px;
  color: var(--color-gray-500);
  font-weight: 500;
  margin-bottom: 6px;
}

.qc-items-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.qc-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 7px 9px;
  background: var(--color-gray-50);
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--color-primary);
  transition: background var(--transition-fast);
}

.qc-item:hover {
  background: var(--color-primary-soft);
}

.qc-item-name {
  font-weight: 500;
  color: var(--color-gray-900);
  font-size: 13px;
  min-width: 0;
}

.qc-item-details {
  display: flex;
  align-items: flex-end;
  flex-direction: column;
  flex-shrink: 0;
  gap: 1px;
  font-size: 11px;
}

.qc-item-coverage {
  color: var(--color-gray-500);
}

.qc-item-premium {
  color: var(--color-primary);
  font-weight: 500;
}

.qc-modify {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-gray-100);
}

.qc-quick-adjust {
  display: flex;
  flex: 1 0 100%;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.qc-quick-adjust > span {
  margin-right: 2px;
  color: var(--color-gray-500);
  font-size: 11px;
}

.qc-quick-adjust button {
  padding: 5px 9px;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-full);
  background: var(--color-gray-50);
  color: var(--color-gray-600);
  cursor: pointer;
  font-size: 11px;
}

.qc-quick-adjust button:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}

.qc-modify-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--color-gray-300);
  border-radius: var(--radius-sm);
  font-size: 13px;
  outline: none;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast);
}

.qc-modify-input:focus {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-ring);
}

.qc-modify-btn {
  padding: 8px 14px;
  background: var(--color-success);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 13px;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.qc-modify-btn:hover {
  background: var(--color-success-hover);
}

.qc-actions {
  display: flex;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-gray-100);
  background: var(--color-surface);
}

.qc-btn {
  flex: 1;
  padding: 8px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  border: none;
}

.qc-archive-toggle {
  width: 100%;
  padding: 10px 16px;
  border: 0;
  border-top: 1px solid var(--color-gray-100);
  background: var(--color-surface);
  color: var(--color-gray-500);
  cursor: pointer;
  font-size: 12px;
}

.qc-archive-toggle:hover {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.qc-btn:active {
  transform: scale(0.97);
}

.qc-btn--primary {
  background: var(--color-primary);
  color: #fff;
}

.qc-btn--primary:hover {
  background: var(--color-primary-hover);
  box-shadow: var(--shadow-sm);
}

.qc-btn--secondary {
  background: var(--color-surface);
  color: var(--color-gray-700);
  border: 1px solid var(--color-gray-300);
}

.qc-btn--secondary:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-soft);
}

.qc-btn--saving {
  background: var(--color-success-soft, #dcfce7);
  color: var(--color-success-hover, #15803d);
  border: 1px solid #bbf7d0;
}

.qc-btn--saving:hover {
  background: #bbf7d0;
}

@media (max-width: 640px) {
  .qc-header,
  .qc-item {
    align-items: flex-start;
  }

  .qc-header {
    gap: 10px;
  }

  .qc-item {
    flex-direction: column;
    gap: 4px;
  }

  .qc-item-details {
    flex-direction: row;
    width: 100%;
    justify-content: space-between;
  }

  .qc-items-list {
    grid-template-columns: 1fr;
  }

  .qc-total-compact strong {
    font-size: 17px;
  }

  .qc-modify {
    flex-direction: column;
  }

  .qc-actions {
    flex-direction: column;
  }
}
</style>
