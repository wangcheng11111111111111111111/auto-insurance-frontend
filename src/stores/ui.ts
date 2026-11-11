import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ToastItem {
  id: number
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
}

let toastSeq = 0

export const useUiStore = defineStore('ui', () => {
  const loading = ref(false)
  const loadingText = ref('')
  const toasts = ref<ToastItem[]>([])

  function setLoading(show: boolean, text = '') {
    loading.value = show
    loadingText.value = text
  }

  function showToast(type: ToastItem['type'], message: string, duration = 3500) {
    if (
      type === 'error' &&
      /abortederror|the operation was aborted|signal is aborted/i.test(message)
    ) {
      return
    }
    const id = ++toastSeq
    toasts.value.push({ id, type, message })
    setTimeout(() => {
      const idx = toasts.value.findIndex((t) => t.id === id)
      if (idx !== -1) toasts.value.splice(idx, 1)
    }, duration)
  }

  function dismissToast(id: number) {
    const idx = toasts.value.findIndex((t) => t.id === id)
    if (idx !== -1) toasts.value.splice(idx, 1)
  }

  return {
    loading,
    loadingText,
    toasts,
    setLoading,
    showToast,
    dismissToast,
  }
})
