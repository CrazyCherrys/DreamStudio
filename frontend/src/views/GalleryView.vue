<template>
  <div class="studio-shell relative min-h-screen overflow-hidden">
    <div class="pointer-events-none absolute inset-0">
      <div
        class="absolute -right-32 -top-40 h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.22),transparent_70%)] blur-3xl"
      ></div>
      <div
        class="absolute -bottom-40 -left-40 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.2),transparent_70%)] blur-3xl"
      ></div>
      <div
        class="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.55),rgba(255,255,255,0.08))] dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.4),rgba(2,6,23,0.6))]"
      ></div>
      <div
        class="absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(15,23,42,0.08)_1px,transparent_1px)] [background-size:30px_30px] dark:[background-image:radial-gradient(rgba(148,163,184,0.12)_1px,transparent_1px)]"
      ></div>
    </div>

    <header class="relative z-20 px-6 py-4">
      <nav class="mx-auto flex max-w-6xl items-center justify-between">
        <router-link to="/home" class="flex items-center gap-3">
          <div class="h-10 w-10 overflow-hidden rounded-xl shadow-md">
            <img :src="siteLogo || '/logo.png'" alt="Logo" class="h-full w-full object-contain" />
          </div>
          <span class="hidden text-sm font-semibold text-gray-900 dark:text-white sm:inline">{{
            siteName
          }}</span>
        </router-link>

        <div class="flex items-center gap-3">
          <router-link to="/home" class="studio-pill">
            {{ t('gallery.nav.home') }}
          </router-link>
          <router-link to="/gallery" class="studio-pill studio-pill-active">
            {{ t('gallery.nav.gallery') }}
          </router-link>

          <LocaleSwitcher />

          <a
            v-if="docUrl"
            :href="docUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-dark-400 dark:hover:bg-dark-800 dark:hover:text-white"
            :title="t('home.viewDocs')"
          >
            <Icon name="book" size="md" />
          </a>

          <button
            @click="toggleTheme"
            class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-dark-400 dark:hover:bg-dark-800 dark:hover:text-white"
            :title="isDark ? t('home.switchToLight') : t('home.switchToDark')"
          >
            <Icon v-if="isDark" name="sun" size="md" />
            <Icon v-else name="moon" size="md" />
          </button>

          <router-link
            v-if="isAuthenticated"
            :to="dashboardPath"
            class="inline-flex items-center gap-2 rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <span
              class="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-[10px] font-semibold text-white"
            >
              {{ userInitial }}
            </span>
            {{ t('home.dashboard') }}
          </router-link>
          <router-link
            v-else
            to="/login"
            class="studio-pill bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            {{ t('home.login') }}
          </router-link>
        </div>
      </nav>
    </header>

    <main class="relative z-10 px-6 pb-16 pt-6">
      <div class="mx-auto max-w-6xl space-y-6">
        <div class="studio-card p-6 md:p-8 animate-slide-up">
          <div class="space-y-3">
            <span class="text-xs font-semibold uppercase tracking-[0.3em] text-orange-600">
              {{ t('gallery.kicker') }}
            </span>
            <h1 class="studio-display text-3xl font-semibold text-gray-900 dark:text-white md:text-4xl">
              {{ t('gallery.title') }}
            </h1>
            <p class="text-sm text-gray-600 dark:text-dark-300">
              {{ t('gallery.subtitle') }}
            </p>
          </div>
        </div>

        <div class="studio-card p-5 md:p-6 animate-fade-in">
          <CreativeGallery variant="page" :page-size="24" :show-pagination="true" />
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore, useAppStore } from '@/stores'
import LocaleSwitcher from '@/components/common/LocaleSwitcher.vue'
import Icon from '@/components/icons/Icon.vue'
import CreativeGallery from '@/components/gallery/CreativeGallery.vue'

const { t } = useI18n()

const authStore = useAuthStore()
const appStore = useAppStore()

const siteName = computed(
  () => appStore.cachedPublicSettings?.site_name || appStore.siteName || 'Sub2API'
)
const siteLogo = computed(() => appStore.cachedPublicSettings?.site_logo || appStore.siteLogo || '')
const docUrl = computed(() => appStore.cachedPublicSettings?.doc_url || appStore.docUrl || '')

const isAuthenticated = computed(() => authStore.isAuthenticated)
const isAdmin = computed(() => authStore.isAdmin)
const dashboardPath = computed(() => (isAdmin.value ? '/admin/dashboard' : '/dashboard'))
const userInitial = computed(() => {
  const user = authStore.user
  if (!user || !user.email) return ''
  return user.email.charAt(0).toUpperCase()
})

const isDark = ref(document.documentElement.classList.contains('dark'))

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

function initTheme() {
  const savedTheme = localStorage.getItem('theme')
  if (
    savedTheme === 'dark' ||
    (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
  ) {
    isDark.value = true
    document.documentElement.classList.add('dark')
  }
}

onMounted(() => {
  initTheme()
  authStore.checkAuth()
  if (!appStore.publicSettingsLoaded) {
    appStore.fetchPublicSettings()
  }
})
</script>
