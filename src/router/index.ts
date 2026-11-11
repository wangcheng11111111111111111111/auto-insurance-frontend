import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { guestOnly: true, hideNav: true },
    },
    {
      path: '/',
      name: 'chat',
      component: () => import('@/views/ChatView.vue'),
      meta: { requiresAuth: true, role: 'customer' },
    },
    {
      path: '/agent',
      name: 'agent',
      component: () => import('@/views/AgentWorkspace.vue'),
      meta: { requiresAuth: true, role: 'agent' },
    },
  ],
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  if (!authStore.initialized) await authStore.initialize()

  if (to.meta.guestOnly) {
    return authStore.isAuthenticated ? authStore.homePath : true
  }
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.role && authStore.user?.role !== to.meta.role) {
    return authStore.homePath
  }
  return true
})

export default router
