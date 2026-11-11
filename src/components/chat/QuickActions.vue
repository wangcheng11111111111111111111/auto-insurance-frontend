<script setup lang="ts">
import { computed } from 'vue'
import type { AvailableType, WorkflowPhase } from '../../api/types'

const props = defineProps<{
  phase: WorkflowPhase
  customerType: 'new' | 'returning' | ''
  hasPlan: boolean
  hasVehicle: boolean
  hasUnderwriting: boolean
  hasPayment: boolean
  availableTypes: AvailableType[]
}>()

const emit = defineEmits<{
  (e: 'selectType', type: string): void
  (e: 'recommend'): void
  (e: 'uploadVehicle'): void
  (e: 'queryPlate'): void
  (e: 'useLastYear'): void
  (e: 'confirmPlan'): void
  (e: 'uploadIdCard'): void
  (e: 'generateQuotation'): void
  (e: 'submitUnderwriting'): void
  (e: 'submitVerification'): void
  (e: 'initiatePayment'): void
  (e: 'verifyPayment'): void
  (e: 'restart'): void
}>()

interface QuickAction {
  label: string
  action: () => void
  primary?: boolean
}

const fallbackTypes: AvailableType[] = [
  { type: 'car', name: '车险', available: true },
  { type: 'property', name: '财险', available: false },
  { type: 'life', name: '人寿险', available: false },
]

const typeOptions = computed(() =>
  props.availableTypes.length ? props.availableTypes : fallbackTypes,
)

const typeMeta: Record<string, { icon: string; description: string }> = {
  car: { icon: '🚗', description: '交强险、商业险与续保全流程' },
  property: { icon: '🏢', description: '暂未开放' },
  life: { icon: '🛡️', description: '暂未开放' },
}

const actions = computed<QuickAction[]>(() => {
  const list: QuickAction[] = []

  if (props.phase === 'collecting_info') {
    if (props.customerType === '' || props.customerType === 'new') {
      list.push({
        label: '📸 上传行驶证（新用户）',
        action: () => emit('uploadVehicle'),
        primary: true,
      })
    }
    list.push({ label: '🔍 老用户车牌查询', action: () => emit('queryPlate') })
  }

  if (props.phase === 'recommending') {
    if (!props.hasPlan) {
      list.push({ label: '✨ 生成智能推荐', action: () => emit('recommend'), primary: true })
    }
    if (props.customerType === 'returning') {
      list.push({ label: '📅 沿用去年方案', action: () => emit('useLastYear') })
    }
  }

  if (props.phase === 'identity_verification') {
    list.push({ label: '🪪 上传身份证', action: () => emit('uploadIdCard'), primary: true })
  }

  if (props.phase === 'quoting') {
    list.push({ label: '📋 生成报价单', action: () => emit('generateQuotation'), primary: true })
  }

  if (props.phase === 'underwriting') {
    if (props.hasUnderwriting) {
      list.push({
        label: '📷 提交验车材料',
        action: () => emit('submitVerification'),
        primary: true,
      })
    } else {
      list.push({ label: '📝 提交核保', action: () => emit('submitUnderwriting'), primary: true })
    }
  }

  if (props.phase === 'payment') {
    if (!props.hasPayment) {
      list.push({ label: '💳 发起支付', action: () => emit('initiatePayment'), primary: true })
    } else {
      list.push({ label: '🔄 核验支付结果', action: () => emit('verifyPayment'), primary: true })
    }
  }

  if (props.phase === 'completed') {
    list.push({ label: '🔄 开始新会话', action: () => emit('restart'), primary: true })
  }

  return list
})
</script>

<template>
  <div class="quick-actions">
    <div v-if="phase === 'insurance_type_selection'" class="type-grid">
      <button
        v-for="type in typeOptions"
        :key="type.type"
        type="button"
        class="type-card"
        :class="{
          'type-card--available': type.available,
          'type-card--disabled': !type.available,
        }"
        :disabled="!type.available"
        @click="type.available && emit('selectType', type.type)"
      >
        <span class="type-icon">{{ typeMeta[type.type]?.icon ?? '🛡️' }}</span>
        <span class="type-copy">
          <strong>{{ type.name }}</strong>
          <small>{{ typeMeta[type.type]?.description ?? '暂未开放' }}</small>
        </span>
        <span class="type-status">{{ type.available ? '立即可用' : '即将开放' }}</span>
      </button>
    </div>

    <template v-for="(action, i) in actions" :key="i">
      <button
        type="button"
        class="action-btn"
        :class="{ 'action-btn--primary': action.primary }"
        @click="action.action"
      >
        {{ action.label }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px 0;
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}

.type-card {
  min-width: 0;
  padding: 14px;
  border: 1px solid var(--color-gray-200);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  color: var(--color-gray-700);
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--transition-fast),
    box-shadow var(--transition-fast),
    transform var(--transition-fast);
}

.type-card--available {
  border-color: #bfdbfe;
  box-shadow: 0 6px 18px rgba(37, 99, 235, 0.08);
}

.type-card--available:hover {
  border-color: var(--color-primary);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.type-card--disabled {
  cursor: not-allowed;
  opacity: 0.58;
  background: var(--color-gray-50);
}

.type-icon {
  display: block;
  font-size: 22px;
  margin-bottom: 6px;
}

.type-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.type-copy strong {
  color: var(--color-gray-900);
  font-size: 14px;
}

.type-copy small {
  color: var(--color-gray-500);
  font-size: 11px;
  line-height: 1.45;
}

.type-status {
  display: inline-block;
  margin-top: 10px;
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 600;
}

.type-card--disabled .type-status {
  color: var(--color-gray-400);
}

.action-btn {
  min-height: 38px;
  padding: 8px 16px;
  border: 1px solid var(--color-gray-300);
  background: var(--color-surface);
  color: var(--color-gray-700);
  border-radius: var(--radius-full);
  font-size: 14px;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-weight: 500;
  white-space: nowrap;
}

.action-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
  background: var(--color-primary-soft);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}

.action-btn:active {
  transform: translateY(0) scale(0.97);
}

.action-btn--primary {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}

.action-btn--primary:hover {
  background: var(--color-primary-hover);
  color: #fff;
  border-color: var(--color-primary-hover);
}

@media (max-width: 720px) {
  .type-grid {
    grid-template-columns: 1fr;
  }

  .type-card {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    align-items: center;
    padding: 12px;
  }

  .type-icon {
    margin: 0;
  }

  .type-status {
    margin-top: 0;
  }

  .action-btn {
    flex: 1 1 auto;
  }
}
</style>
