<script setup lang="ts">
import { onBeforeUnmount, ref, useId } from 'vue'

const props = defineProps<{
  title?: string
  slots: { label: string; key: string }[]
  accept?: string
}>()

const emit = defineEmits<{
  (e: 'upload', files: Record<string, File | null>): void
}>()

const slotStates = ref<Record<string, { file: File | null; previewUrl: string }>>({})
const draggingKey = ref<string | null>(null)
const uploading = ref(false)
const progress = ref(0)
const uploaderId = `file-uploader-${useId()}`

props.slots.forEach((s) => {
  slotStates.value[s.key] = { file: null, previewUrl: '' }
})

function getState(key: string) {
  return slotStates.value[key] ?? { file: null, previewUrl: '' }
}

function handleDrop(key: string, event: DragEvent) {
  draggingKey.value = null
  const file = event.dataTransfer?.files?.[0]
  if (file) assignFile(key, file)
}

function handleSelect(key: string, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) assignFile(key, file)
  input.value = ''
}

function assignFile(key: string, file: File) {
  const current = slotStates.value[key]
  if (current?.previewUrl) URL.revokeObjectURL(current.previewUrl)
  const url = URL.createObjectURL(file)
  slotStates.value[key] = { file, previewUrl: url }
}

function inputId(key: string) {
  return `${uploaderId}-${key}`
}

function openFilePicker(key: string) {
  if (!uploading.value) {
    document.getElementById(inputId(key))?.click()
  }
}

function clearFile(key: string) {
  const state = slotStates.value[key]
  if (state?.previewUrl) URL.revokeObjectURL(state.previewUrl)
  slotStates.value[key] = { file: null, previewUrl: '' }
}

function canSubmit() {
  return props.slots.every((s) => Boolean(slotStates.value[s.key]?.file))
}

async function submit() {
  if (!canSubmit() || uploading.value) return
  uploading.value = true
  progress.value = 0

  const result: Record<string, File | null> = {}
  props.slots.forEach((s) => {
    result[s.key] = slotStates.value[s.key]?.file ?? null
  })

  const steps = 20
  for (let i = 1; i <= steps; i++) {
    await new Promise((r) => setTimeout(r, 40))
    progress.value = Math.round((i / steps) * 60)
  }

  emit('upload', result)

  for (let i = 61; i <= 100; i++) {
    await new Promise((r) => setTimeout(r, 25))
    progress.value = i
  }

  setTimeout(() => {
    uploading.value = false
    progress.value = 0
  }, 400)
}

onBeforeUnmount(() => {
  Object.values(slotStates.value).forEach((state) => {
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl)
  })
})
</script>

<template>
  <div class="file-uploader">
    <div v-if="title" class="uploader-title">{{ title }}</div>
    <div class="upload-slots">
      <div
        v-for="slot in slots"
        :key="slot.key"
        class="upload-slot"
        :class="{ 'upload-slot--dragging': draggingKey === slot.key }"
        role="button"
        tabindex="0"
        :aria-label="`${slot.label}，点击选择图片`"
        :aria-disabled="uploading"
        @click="openFilePicker(slot.key)"
        @keydown.enter.prevent="openFilePicker(slot.key)"
        @keydown.space.prevent="openFilePicker(slot.key)"
        @dragover.prevent="draggingKey = slot.key"
        @dragleave="draggingKey = null"
        @drop.prevent="handleDrop(slot.key, $event)"
      >
        <template v-if="getState(slot.key).previewUrl">
          <img :src="getState(slot.key).previewUrl" :alt="slot.label" />
          <button type="button" class="clear-btn" @click.stop="clearFile(slot.key)">✕</button>
        </template>
        <template v-else>
          <div class="upload-icon">📷</div>
          <div class="upload-label">{{ slot.label }}</div>
          <div class="upload-hint">点击或拖拽图片到此处</div>
        </template>
        <input
          :id="inputId(slot.key)"
          type="file"
          :accept="accept ?? 'image/*'"
          hidden
          @click.stop
          @change="handleSelect(slot.key, $event)"
        />
      </div>
    </div>

    <div class="upload-actions">
      <div v-if="uploading" class="progress-bar">
        <div class="progress-fill" :style="{ width: `${progress}%` }" />
        <span class="progress-text">{{ progress }}%</span>
      </div>
      <button v-else type="button" class="submit-btn" :disabled="!canSubmit()" @click="submit">
        确认上传
      </button>
    </div>
  </div>
</template>

<style scoped>
.file-uploader {
  padding: 16px;
  background: var(--color-gray-50);
  border-radius: var(--radius-lg);
  border: 1px dashed var(--color-gray-300);
}

.uploader-title {
  font-weight: 600;
  color: var(--color-gray-700);
  margin-bottom: 12px;
  font-size: 14px;
}

.upload-slots {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.upload-slot {
  width: 160px;
  height: 160px;
  border: 2px dashed var(--color-gray-300);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  background: var(--color-surface);
  transition: all var(--transition-fast);
  position: relative;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  touch-action: manipulation;
}

.upload-slot:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.upload-slot:focus-visible {
  border-color: var(--color-primary);
  outline: 3px solid rgba(59, 130, 246, 0.18);
  outline-offset: 2px;
}

.upload-slot--dragging {
  border-color: var(--color-primary);
  background: var(--color-primary-softer);
  transform: scale(1.03);
  box-shadow: var(--shadow-ring);
}

.upload-icon {
  font-size: 32px;
}

.upload-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-gray-700);
}

.upload-hint {
  font-size: 11px;
  color: var(--color-gray-400);
  pointer-events: none;
}

.upload-slot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  animation: fade-in var(--transition-base) both;
}

.clear-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  border: none;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--transition-fast);
}

.clear-btn:hover {
  background: var(--color-danger);
}

.upload-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}

.submit-btn {
  padding: 8px 24px;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.submit-btn:hover:not(:disabled) {
  background: var(--color-primary-hover);
  box-shadow: var(--shadow-sm);
}

.submit-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.submit-btn:disabled {
  background: var(--color-gray-200);
  color: var(--color-gray-400);
  cursor: not-allowed;
}

.progress-bar {
  flex: 1;
  height: 32px;
  background: var(--color-gray-200);
  border-radius: var(--radius-md);
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--color-primary), #60a5fa);
  transition: width 0.2s ease;
}

.progress-text {
  position: absolute;
  right: 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-gray-700);
}

@media (max-width: 640px) {
  .upload-slots {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .upload-slot {
    width: 100%;
    height: 132px;
    min-width: 0;
  }

  .upload-icon {
    font-size: 26px;
  }

  .upload-hint {
    padding: 0 8px;
    text-align: center;
  }
}
</style>
