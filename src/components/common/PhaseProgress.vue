<script setup lang="ts">
import { computed } from 'vue'
import { PHASE_LABELS, PHASE_ORDER } from '../../constants'
import type { WorkflowPhase } from '../../api/types'

const props = defineProps<{
  currentPhase: WorkflowPhase
}>()

const currentIndex = computed(() => {
  const idx = PHASE_ORDER.indexOf(props.currentPhase)
  return idx
})

function getStatus(index: number): 'done' | 'active' | 'pending' {
  if (index < currentIndex.value) return 'done'
  if (index === currentIndex.value) return 'active'
  return 'pending'
}
</script>

<template>
  <div class="phase-progress" role="list" aria-label="车险出单流程">
    <template v-for="(phase, index) in PHASE_ORDER" :key="phase">
      <div
        class="phase-node"
        :class="`phase-node--${getStatus(index)}`"
        role="listitem"
        :aria-current="getStatus(index) === 'active' ? 'step' : undefined"
      >
        <div class="phase-circle">
          <span v-if="getStatus(index) === 'done'">✓</span>
          <span v-else>{{ index + 1 }}</span>
        </div>
        <div class="phase-label">{{ PHASE_LABELS[phase] }}</div>
      </div>
      <div
        v-if="index < PHASE_ORDER.length - 1"
        class="phase-connector"
        :class="`phase-connector--${getStatus(index)}`"
      />
    </template>
  </div>
</template>

<style scoped>
.phase-progress {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 14px 18px;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--color-gray-200);
  min-width: 0;
}

.phase-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 58px;
  flex: 1 1 0;
}

.phase-circle {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  transition: all var(--transition-base);
  background: var(--color-gray-200);
  color: var(--color-gray-400);
}

.phase-node--done .phase-circle {
  background: var(--color-success);
  color: #fff;
}

.phase-node--active .phase-circle {
  background: var(--color-primary);
  color: #fff;
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
  animation: pulse 2s infinite;
}

.phase-label {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-gray-500);
  text-align: center;
  white-space: normal;
  line-height: 1.35;
  transition: color var(--transition-base);
}

.phase-node--active .phase-label {
  color: var(--color-primary);
  font-weight: 600;
}

.phase-node--done .phase-label {
  color: var(--color-success);
}

.phase-connector {
  height: 2px;
  min-width: 12px;
  max-width: 44px;
  background: var(--color-gray-200);
  margin: 0 4px;
  flex: 1 1 26px;
  margin-bottom: 24px;
  border-radius: var(--radius-full);
  transition: background var(--transition-base);
}

.phase-connector--done {
  background: var(--color-success);
}

@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(59, 130, 246, 0.1);
  }
}

@media (max-width: 768px) {
  .phase-progress {
    padding: 12px 10px;
    overflow-x: auto;
    justify-content: flex-start;
  }
  .phase-node {
    min-width: 64px;
    flex: 0 0 64px;
  }
  .phase-circle {
    width: 24px;
    height: 24px;
    font-size: 11px;
  }
  .phase-label {
    font-size: 10px;
  }
  .phase-connector {
    min-width: 18px;
    flex: 0 0 18px;
  }
}

@media (max-width: 480px) {
  .phase-progress {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    row-gap: 12px;
    column-gap: 4px;
    overflow: visible;
  }

  .phase-node {
    min-width: 0;
    flex: none;
  }

  .phase-connector {
    display: none;
  }

  .phase-label {
    max-width: 78px;
  }
}
</style>
