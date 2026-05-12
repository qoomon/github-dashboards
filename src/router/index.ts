import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/WorkflowDashboardView.vue')
    },
    {
      path: '/legacy',
      name: 'legacy',
      component: () => import('../views/ActionsView.vue')
    }
  ]
})

export default router
