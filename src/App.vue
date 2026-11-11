<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

const uiStore = useUiStore()
const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

const showNavigation = computed(() => !route.meta.hideNav && authStore.isAuthenticated)

async function handleLogout() {
  await authStore.logout()
  await router.replace('/login')
}
</script>

<template>
  <div class="app-root">
    <nav v-if="showNavigation" class="app-nav">
      <div class="app-nav-inner">
        <div class="app-brand">
          <img src="/brand-mark.svg" alt="" />
          <span>车险出单智能体</span>
        </div>
        <div class="app-nav-tabs">
          <RouterLink
            v-if="authStore.user?.role === 'customer'"
            to="/"
            class="app-tab"
            active-class="app-tab--active"
          >
            💬 用户出单
          </RouterLink>
          <RouterLink
            v-if="authStore.user?.role === 'agent'"
            to="/agent"
            class="app-tab"
            active-class="app-tab--active"
          >
            💼 业务员工作台
          </RouterLink>
        </div>
        <div class="app-user">
          <span class="app-user-role">
            {{ authStore.user?.role === 'agent' ? '业务员' : '客户' }}
          </span>
          <span class="app-user-name">{{ authStore.user?.name }}</span>
          <button type="button" class="app-logout" @click="handleLogout">退出</button>
        </div>
      </div>
    </nav>

    <main class="app-main">
      <router-view v-if="authStore.initialized || route.name === 'login'" />
      <div v-else class="app-boot">
        <div class="loading-spinner" />
        <span>正在恢复安全会话...</span>
      </div>
    </main>

    <div v-if="uiStore.loading" class="loading-overlay">
      <div class="loading-spinner" />
      <div v-if="uiStore.loadingText" class="loading-text">{{ uiStore.loadingText }}</div>
    </div>

    <div class="toast-container">
      <div
        v-for="toast in uiStore.toasts"
        :key="toast.id"
        class="toast"
        :class="`toast--${toast.type}`"
        @click="uiStore.dismissToast(toast.id)"
      >
        {{ toast.message }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-root {
  width: 100%;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
  overflow: hidden;
}

.app-nav {
  flex-shrink: 0;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-gray-200);
  box-shadow: var(--shadow-xs);
  z-index: 100;
}

.app-nav-inner {
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 24px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.app-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-gray-900);
  white-space: nowrap;
}

.app-brand img {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 8px;
  box-shadow: 0 4px 10px rgba(37, 99, 235, 0.2);
}

.app-brand span {
  background: linear-gradient(135deg, var(--color-primary), #8b5cf6);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.app-nav-tabs {
  display: flex;
  gap: var(--space-1);
  background: var(--color-gray-100);
  padding: 4px;
  border-radius: var(--radius-full);
}

.app-tab {
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-gray-500);
  border-radius: var(--radius-full);
  text-decoration: none;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.app-tab:hover {
  color: var(--color-gray-700);
  background: rgba(255, 255, 255, 0.6);
}

.app-tab--active {
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}

.app-user {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.app-user-role {
  padding: 3px 7px;
  border-radius: var(--radius-full);
  background: var(--color-primary-soft);
  color: var(--color-primary-active);
  font-size: 10px;
  font-weight: 600;
}

.app-user-name {
  max-width: 120px;
  overflow: hidden;
  color: var(--color-gray-700);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-logout {
  padding: 5px 9px;
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-full);
  background: var(--color-surface);
  color: var(--color-gray-500);
  cursor: pointer;
  font-size: 11px;
}

.app-logout:hover {
  border-color: #fecaca;
  color: var(--color-danger);
  background: var(--color-danger-soft);
}

.app-main {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.app-boot {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--color-gray-500);
  font-size: 13px;
}

.loading-overlay {
  position: fixed;
  inset: 0;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(3px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  gap: var(--space-4);
  animation: fade-in var(--transition-fast) both;
}

.loading-spinner {
  width: 44px;
  height: 44px;
  border: 4px solid var(--color-gray-200);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading-text {
  color: var(--color-gray-500);
  font-size: 14px;
}

.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 360px;
}

.toast {
  padding: 12px 18px;
  border-radius: var(--radius-md);
  font-size: 14px;
  cursor: pointer;
  box-shadow: var(--shadow-lg);
  animation: toast-in 0.28s cubic-bezier(0.21, 1.02, 0.73, 1) both;
  word-break: break-word;
  line-height: 1.5;
}

.toast:hover {
  transform: translateY(-1px);
}

.toast--success {
  background: var(--color-success-soft);
  color: var(--color-success-ink);
  border-left: 4px solid var(--color-success);
}

.toast--error {
  background: var(--color-danger-soft);
  color: var(--color-danger-ink);
  border-left: 4px solid var(--color-danger);
}

.toast--warning {
  background: var(--color-warning-soft);
  color: var(--color-warning-ink);
  border-left: 4px solid var(--color-warning);
}

.toast--info {
  background: var(--color-primary-softer);
  color: #1e40af;
  border-left: 4px solid var(--color-primary);
}

@keyframes toast-in {
  from {
    transform: translateX(24px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@media (max-width: 640px) {
  .app-nav-inner {
    height: 54px;
    padding: 0 12px;
    gap: 10px;
  }

  .app-brand {
    font-size: 14px;
  }

  .app-nav-tabs {
    padding: 3px;
  }

  .app-tab {
    padding: 7px 10px;
    font-size: 12px;
  }

  .app-user-role,
  .app-user-name {
    display: none;
  }

  .app-nav-inner {
    justify-content: space-between;
  }

  .toast-container {
    top: 64px;
    right: 10px;
    left: 10px;
    max-width: none;
  }
}
</style>
