<script setup lang="ts">
import type { Policy } from '../../api/types'
import { INSURANCE_NAMES } from '../../constants'

defineProps<{
  policy: Policy
}>()
</script>

<template>
  <div class="policy-card">
    <div class="pc-confetti">🎉 🎊 ✨ 🎊 🎉</div>

    <div class="pc-header">
      <div class="pc-title">保险单</div>
      <div class="pc-policy-no">{{ policy.policy_number }}</div>
    </div>

    <div class="pc-parties">
      <div class="pc-party">
        <span>投保人</span>
        <strong>{{ policy.applicant?.name || '—' }}</strong>
        <small>{{ policy.applicant?.id_number || '证件信息待补充' }}</small>
      </div>
      <div class="pc-party">
        <span>被保险人</span>
        <strong>{{ policy.insured?.name || policy.applicant?.name || '—' }}</strong>
        <small>{{
          policy.insured?.id_number || policy.applicant?.id_number || '证件信息待补充'
        }}</small>
      </div>
    </div>

    <div class="pc-section" v-if="policy.vehicle">
      <div class="pc-section-title">🚗 车辆信息</div>
      <div class="pc-grid">
        <div class="pc-field">
          <span class="pc-field-label">车牌号</span>
          <span class="pc-field-value">{{ policy.vehicle.license_plate }}</span>
        </div>
        <div class="pc-field">
          <span class="pc-field-label">品牌型号</span>
          <span class="pc-field-value">{{ policy.vehicle.brand_model }}</span>
        </div>
        <div class="pc-field">
          <span class="pc-field-label">车架号</span>
          <span class="pc-field-value pc-field-value--mono">{{ policy.vehicle.vin }}</span>
        </div>
        <div class="pc-field">
          <span class="pc-field-label">使用性质</span>
          <span class="pc-field-value">{{ policy.vehicle.use_type || '—' }}</span>
        </div>
      </div>
    </div>

    <div class="pc-section">
      <div class="pc-section-title">📋 承保明细</div>
      <table class="pc-table">
        <thead>
          <tr>
            <th>险种</th>
            <th class="pc-col-num">保额</th>
            <th class="pc-col-num">保费</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in policy.items_detail" :key="item.code">
            <td>{{ INSURANCE_NAMES[item.code] ?? item.name }}</td>
            <td class="pc-col-num">¥{{ Number(item.coverage_amount).toLocaleString() }}</td>
            <td class="pc-col-num">¥{{ Number(item.premium).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="pc-dates">
      <div class="pc-date-block">
        <div class="pc-date-label">生效日期</div>
        <div class="pc-date-value">{{ policy.effective_date ?? '—' }}</div>
      </div>
      <div class="pc-date-arrow">→</div>
      <div class="pc-date-block">
        <div class="pc-date-label">截止日期</div>
        <div class="pc-date-value">{{ policy.expire_date ?? '—' }}</div>
      </div>
    </div>

    <div class="pc-total">
      <span>💰 本单总保费</span>
      <span class="pc-total-amount">¥{{ Number(policy.total_premium).toLocaleString() }}</span>
    </div>

    <details class="pc-terms">
      <summary>📜 保险条款</summary>
      <ul class="pc-terms-list">
        <li v-for="(term, i) in policy.terms_and_conditions" :key="i">
          {{ term }}
        </li>
      </ul>
    </details>
  </div>
</template>

<style scoped>
.policy-card {
  margin-top: 16px;
  border: 1px solid #fde68a;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, #fffbeb, var(--color-warning-soft));
  overflow: hidden;
  box-shadow: var(--shadow-md);
  animation: pop-in var(--transition-slow) both;
}

.pc-confetti {
  text-align: center;
  padding: 12px;
  font-size: 18px;
  letter-spacing: 4px;
}

.pc-header {
  text-align: center;
  padding: 16px;
  background: var(--color-surface);
  border-bottom: 2px solid #fbbf24;
}

.pc-parties {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px dashed #fbbf24;
  background: var(--color-surface);
}

.pc-party {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--color-gray-100);
  border-radius: var(--radius-md);
  background: var(--color-gray-50);
}

.pc-party span {
  color: var(--color-gray-400);
  font-size: 11px;
}

.pc-party strong {
  color: var(--color-gray-900);
  font-size: 14px;
}

.pc-party small {
  overflow-wrap: anywhere;
  color: var(--color-gray-500);
  font-family: var(--font-mono);
  font-size: 11px;
}

.pc-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-warning-ink);
}

.pc-policy-no {
  font-family: var(--font-mono);
  font-size: 13px;
  color: #78350f;
  margin-top: 4px;
}

.pc-section {
  padding: 12px 16px;
  border-bottom: 1px dashed #fbbf24;
  background: var(--color-surface);
}

.pc-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-warning-ink);
  margin-bottom: 10px;
}

.pc-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 20px;
}

.pc-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pc-field-label {
  font-size: 11px;
  color: var(--color-gray-400);
}

.pc-field-value {
  font-size: 14px;
  color: var(--color-gray-900);
  font-weight: 500;
}

.pc-field-value--mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

.pc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.pc-table th {
  text-align: left;
  padding: 6px 8px;
  color: var(--color-gray-500);
  font-weight: 500;
  border-bottom: 1px solid var(--color-gray-200);
}

.pc-table td {
  padding: 8px;
  color: var(--color-gray-900);
  border-bottom: 1px solid var(--color-gray-100);
}

.pc-col-num {
  text-align: right;
}

.pc-dates {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px;
  background: var(--color-surface);
}

.pc-date-block {
  text-align: center;
}

.pc-date-label {
  font-size: 11px;
  color: var(--color-gray-400);
}

.pc-date-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-gray-900);
  margin-top: 2px;
}

.pc-date-arrow {
  color: #fbbf24;
  font-size: 20px;
}

.pc-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  background: linear-gradient(135deg, var(--color-warning-soft), #fde68a);
  font-weight: 600;
  color: #78350f;
}

.pc-total-amount {
  font-size: 22px;
  font-weight: 700;
  color: #b45309;
}

.pc-terms {
  padding: 12px 16px;
  background: var(--color-surface);
  font-size: 12px;
}

.pc-terms summary {
  cursor: pointer;
  color: var(--color-gray-500);
  font-weight: 500;
  padding: 4px 0;
  transition: color var(--transition-fast);
}

.pc-terms summary:hover {
  color: var(--color-primary);
}

.pc-terms-list {
  padding-left: 16px;
  color: var(--color-gray-500);
  line-height: 1.8;
  margin-top: 8px;
}

@media (max-width: 640px) {
  .pc-parties,
  .pc-grid {
    grid-template-columns: 1fr;
  }

  .pc-table {
    font-size: 12px;
  }

  .pc-table th,
  .pc-table td {
    padding: 7px 4px;
  }

  .pc-dates {
    gap: 8px;
    padding: 14px 10px;
  }
}
</style>
