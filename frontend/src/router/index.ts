/**
 * Vue Router configuration for DreamStudio frontend
 * Defines all application routes with lazy loading and navigation guards
 */

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { authAPI } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'
import { useNavigationLoadingState } from '@/composables/useNavigationLoading'
import { useRoutePrefetch } from '@/composables/useRoutePrefetch'

/**
 * Route definitions with lazy loading
 */
const isUserCustomKeyEnabled = async (): Promise<boolean> => {
  const appStore = useAppStore()
  if (appStore.cachedPublicSettings) {
    return appStore.cachedPublicSettings.user_custom_key_enabled
  }

  try {
    const settings = await authAPI.getPublicSettings()
    return settings.user_custom_key_enabled
  } catch (error) {
    console.error('Failed to load public settings for api-settings route:', error)
    return false
  }
}

const routes: RouteRecordRaw[] = [
  // ==================== Setup Routes ====================
  {
    path: '/setup',
    name: 'Setup',
    component: () => import('@/views/setup/SetupWizardView.vue'),
    meta: {
      requiresAuth: false,
      title: 'Setup'
    }
  },

  // ==================== Public Routes ====================
  {
    path: '/',
    name: 'Landing',
    component: () => import('@/views/LandingView.vue'),
    meta: {
      requiresAuth: false
    }
  },
  {
    path: '/home',
    name: 'Home',
    component: () => import('@/views/HubView.vue'),
    meta: {
      requiresAuth: false,
      title: 'Home'
    }
  },
  {
    path: '/inspiration',
    name: 'Inspiration',
    component: () => import('@/views/InspirationView.vue'),
    meta: {
      requiresAuth: false,
      title: 'Inspiration Square',
      titleKey: 'inspiration.title'
    }
  },
  {
    path: '/gallery',
    redirect: '/inspiration'
  },
  {
    path: '/assets',
    name: 'Assets',
    component: () => import('@/views/AssetsView.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: false,
      title: 'My Assets',
      titleKey: 'assets.title',
      descriptionKey: 'assets.subtitle'
    }
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: {
      requiresAuth: false,
      title: 'Login'
    }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/auth/RegisterView.vue'),
    meta: {
      requiresAuth: false,
      title: 'Register'
    }
  },
  {
    path: '/email-verify',
    name: 'EmailVerify',
    component: () => import('@/views/auth/EmailVerifyView.vue'),
    meta: {
      requiresAuth: false,
      title: 'Verify Email'
    }
  },
  {
    path: '/auth/callback',
    name: 'OAuthCallback',
    component: () => import('@/views/auth/OAuthCallbackView.vue'),
    meta: {
      requiresAuth: false,
      title: 'OAuth Callback'
    }
  },
  {
    path: '/auth/linuxdo/callback',
    name: 'LinuxDoOAuthCallback',
    component: () => import('@/views/auth/LinuxDoCallbackView.vue'),
    meta: {
      requiresAuth: false,
      title: 'LinuxDo OAuth Callback'
    }
  },

  // ==================== User Routes ====================
  {
    path: '/ai-image',
    name: 'AiImage',
    component: () => import('@/views/user/AiImageView.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: false,
      title: 'AI Image',
      titleKey: 'nav.aiImage',
      descriptionKey: 'home.generator.subtitle',
      hideHeaderTitle: true
    }
  },
  {
    path: '/ai-video',
    name: 'AiVideo',
    component: () => import('@/views/user/AiVideoView.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: false,
      title: 'AI Video',
      titleKey: 'nav.aiVideo',
      descriptionKey: 'home.generator.subtitle',
      hideHeaderTitle: true
    }
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/user/DashboardView.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: false,
      title: 'Dashboard',
      titleKey: 'dashboard.title',
      descriptionKey: 'dashboard.welcomeMessage'
    }
  },
  {
    path: '/redink',
    name: 'RedInk',
    component: () => import('@/views/redink/RedInkView.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: false,
      title: 'Xiaohongshu Posts',
      titleKey: 'redink.title',
      descriptionKey: 'redink.subtitle',
      hideHeader: true
    }
  },
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('@/views/user/ProfileView.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: false,
      title: 'Profile',
      titleKey: 'profile.title',
      descriptionKey: 'profile.description'
    }
  },
  {
    path: '/model-settings',
    name: 'ModelSettings',
    component: () => import('@/views/user/ModelSettingsView.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      title: 'Model Settings',
      titleKey: 'modelSettings.title',
      descriptionKey: 'modelSettings.description'
    }
  },
  {
    path: '/api-settings',
    name: 'ApiSettings',
    component: () => import('@/views/user/ApiSettingsView.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: false,
      titleKey: 'userApiSettings.title',
      descriptionKey: 'userApiSettings.description'
    },
    beforeEnter: async (_to, _from, next) => {
      const enabled = await isUserCustomKeyEnabled()
      if (enabled) {
        next()
      } else {
        next('/dashboard')
      }
    }
  },

  // ==================== Admin Routes ====================
  {
    path: '/admin',
    redirect: '/admin/dashboard'
  },
  {
    path: '/admin/dashboard',
    name: 'AdminDashboard',
    component: () => import('@/views/admin/DashboardView.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      title: 'Admin Dashboard',
      titleKey: 'admin.dashboard.title',
      descriptionKey: 'admin.dashboard.description'
    }
  },
  {
    path: '/admin/ops',
    name: 'AdminOps',
    component: () => import('@/views/admin/ops/OpsDashboard.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      title: 'Ops Monitoring',
      titleKey: 'admin.ops.title',
      descriptionKey: 'admin.ops.description'
    }
  },
  {
    path: '/admin/users',
    name: 'AdminUsers',
    component: () => import('@/views/admin/UsersView.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      title: 'User Management',
      titleKey: 'admin.users.title',
      descriptionKey: 'admin.users.description'
    }
  },
  {
    path: '/admin/settings',
    name: 'AdminSettings',
    component: () => import('@/views/admin/SettingsView.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      title: 'System Settings',
      titleKey: 'admin.settings.title',
      descriptionKey: 'admin.settings.description'
    }
  },
  {
    path: '/admin/api-settings',
    name: 'AdminApiSettings',
    component: () => import('@/views/admin/ApiSettingsView.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      title: 'API Settings',
      titleKey: 'admin.apiSettings.title',
      descriptionKey: 'admin.apiSettings.description'
    }
  },
  {
    path: '/admin/inspiration',
    name: 'AdminInspiration',
    component: () => import('@/views/admin/InspirationView.vue'),
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      title: 'Inspiration Review',
      titleKey: 'admin.inspiration.title',
      descriptionKey: 'admin.inspiration.description'
    }
  },

  // ==================== 404 Not Found ====================
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/views/NotFoundView.vue'),
    meta: {
      title: '404 Not Found'
    }
  }
]

/**
 * Create router instance
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    // Scroll to saved position when using browser back/forward
    if (savedPosition) {
      return savedPosition
    }
    // Scroll to top for new routes
    return { top: 0 }
  }
})

/**
 * Navigation guard: Authentication check
 */
let authInitialized = false

// 初始化导航加载状态和预加载
const navigationLoading = useNavigationLoadingState()
// 延迟初始化预加载，传入 router 实例
let routePrefetch: ReturnType<typeof useRoutePrefetch> | null = null

router.beforeEach((to, _from, next) => {
  // 开始导航加载状态
  navigationLoading.startNavigation()

  const authStore = useAuthStore()

  // Restore auth state from localStorage on first navigation (page refresh)
  if (!authInitialized) {
    authStore.checkAuth()
    authInitialized = true
  }

  // Set page title
  const appStore = useAppStore()
  const siteName = appStore.siteName || 'DreamStudio'
  if (to.meta.title) {
    document.title = `${to.meta.title} - ${siteName}`
  } else {
    document.title = siteName
  }

  // Check if route requires authentication
  const requiresAuth = to.meta.requiresAuth !== false // Default to true
  const requiresAdmin = to.meta.requiresAdmin === true

  // If route doesn't require auth, allow access
  if (!requiresAuth) {
    // If already authenticated and trying to access login/register, redirect to appropriate dashboard
    if (authStore.isAuthenticated && (to.path === '/login' || to.path === '/register')) {
      // Admin users go to admin dashboard, regular users go to user dashboard
      next(authStore.isAdmin ? '/admin/dashboard' : '/dashboard')
      return
    }
    next()
    return
  }

  // Route requires authentication
  if (!authStore.isAuthenticated) {
    // Not authenticated, redirect to login
    next({
      path: '/login',
      query: { redirect: to.fullPath } // Save intended destination
    })
    return
  }

  // Check admin requirement
  if (requiresAdmin && !authStore.isAdmin) {
    // User is authenticated but not admin, redirect to user dashboard
    next('/dashboard')
    return
  }

  // All checks passed, allow navigation
  next()
})

/**
 * Navigation guard: End loading and trigger prefetch
 */
router.afterEach((to) => {
  // 结束导航加载状态
  navigationLoading.endNavigation()

  // 懒初始化预加载（首次导航时创建，传入 router 实例）
  if (!routePrefetch) {
    routePrefetch = useRoutePrefetch(router)
  }
  // 触发路由预加载（在浏览器空闲时执行）
  routePrefetch.triggerPrefetch(to)
})

/**
 * Navigation guard: Error handling
 * Handles dynamic import failures caused by deployment updates
 */
router.onError((error) => {
  console.error('Router error:', error)

  // Check if this is a dynamic import failure (chunk loading error)
  const isChunkLoadError =
    error.message?.includes('Failed to fetch dynamically imported module') ||
    error.message?.includes('Loading chunk') ||
    error.message?.includes('Loading CSS chunk') ||
    error.name === 'ChunkLoadError'

  if (isChunkLoadError) {
    // Avoid infinite reload loop by checking sessionStorage
    const reloadKey = 'chunk_reload_attempted'
    const lastReload = sessionStorage.getItem(reloadKey)
    const now = Date.now()

    // Allow reload if never attempted or more than 10 seconds ago
    if (!lastReload || now - parseInt(lastReload) > 10000) {
      sessionStorage.setItem(reloadKey, now.toString())
      console.warn('Chunk load error detected, reloading page to fetch latest version...')
      window.location.reload()
    } else {
      console.error('Chunk load error persists after reload. Please clear browser cache.')
    }
  }
})

export default router
