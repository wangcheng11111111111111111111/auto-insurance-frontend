import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { authLogin, authLogout, authRefresh, authRegister, clearAccessToken } from '../api'
import type { AuthUser } from '../api/types'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const initialized = ref(false)
  const loading = ref(false)

  const isAuthenticated = computed(() => Boolean(user.value))
  const homePath = computed(() => (user.value?.role === 'agent' ? '/agent' : '/'))

  async function initialize() {
    if (initialized.value) return
    loading.value = true
    try {
      const session = await authRefresh()
      user.value = session.user
    } catch {
      user.value = null
      clearAccessToken()
    } finally {
      loading.value = false
      initialized.value = true
    }
  }

  async function login(account: string, password: string, role: 'customer' | 'agent') {
    loading.value = true
    try {
      const session = await authLogin(account, password, role)
      user.value = session.user
      initialized.value = true
      return session.user
    } finally {
      loading.value = false
    }
  }

  async function register(payload: {
    role: 'customer' | 'agent'
    account: string
    name: string
    phone: string
    password: string
    agent_id?: string
    employee_no?: string
    department?: string
    invite_code?: string
  }) {
    loading.value = true
    try {
      const session = await authRegister(payload)
      user.value = session.user
      initialized.value = true
      return session.user
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    loading.value = true
    try {
      await authLogout()
    } finally {
      user.value = null
      clearAccessToken()
      loading.value = false
    }
  }

  return {
    user,
    initialized,
    loading,
    isAuthenticated,
    homePath,
    initialize,
    login,
    register,
    logout,
  }
})
