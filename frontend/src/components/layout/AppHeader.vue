<template>
  <header
    v-if="hasHeaderContent || hideHeader"
    :class="[
      'glass sticky top-0 z-30 border-b border-gray-200/50 dark:border-dark-700/50',
      hideHeader ? 'lg:hidden' : ''
    ]"
  >
    <div class="flex h-16 items-center justify-between px-4 md:px-6">
      <!-- Left: Mobile Menu Toggle + Page Title -->
      <div class="flex items-center gap-4">
        <button
          @click="toggleMobileSidebar"
          class="btn-ghost btn-icon lg:hidden"
          aria-label="Toggle Menu"
        >
          <Icon name="menu" size="md" />
        </button>

        <div v-if="pageTitle || pageDescription" class="hidden lg:block">
          <h1 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ pageTitle }}
          </h1>
          <p v-if="pageDescription" class="text-xs text-gray-500 dark:text-dark-400">
            {{ pageDescription }}
          </p>
        </div>
      </div>

      <!-- Right: Theme/Language Switchers + Docs -->
      <div class="flex items-center gap-3">
        <!-- Theme and Language Switchers (only on homepage) -->
        <div v-if="isHomePage" class="flex items-center gap-2">
          <LocaleSwitcher />
          <button
            @click="toggleTheme"
            class="btn-ghost btn-icon"
            :title="isDark ? t('nav.lightMode') : t('nav.darkMode')"
          >
            <SunIcon v-if="isDark" class="h-5 w-5 text-amber-500" />
            <MoonIcon v-else class="h-5 w-5" />
          </button>
        </div>

        <!-- Docs Link -->
        <a
          v-if="docUrl"
          :href="docUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-dark-400 dark:hover:bg-dark-800 dark:hover:text-white"
        >
          <Icon name="book" size="sm" />
          <span class="hidden sm:inline">{{ t('nav.docs') }}</span>
        </a>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, h, ref, type Component } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores'
import Icon from '@/components/icons/Icon.vue'
import LocaleSwitcher from '@/components/common/LocaleSwitcher.vue'

const route = useRoute()
const { t } = useI18n()
const appStore = useAppStore()
const docUrl = computed(() => appStore.docUrl)
const hideHeader = computed(() => Boolean(route.meta.hideHeader))

const hideHeaderTitle = computed(() => Boolean(route.meta.hideHeaderTitle))

const pageTitle = computed(() => {
  if (hideHeaderTitle.value) return ''
  const titleKey = route.meta.titleKey as string
  if (titleKey) {
    return t(titleKey)
  }
  return (route.meta.title as string) || ''
})

const pageDescription = computed(() => {
  if (hideHeaderTitle.value) return ''
  const descKey = route.meta.descriptionKey as string
  if (descKey) {
    return t(descKey)
  }
  return (route.meta.description as string) || ''
})

const hasHeaderContent = computed(() => Boolean(pageTitle.value || pageDescription.value || docUrl.value))

function toggleMobileSidebar() {
  appStore.toggleMobileSidebar()
}

// Theme toggle
const isDark = ref(document.documentElement.classList.contains('dark'))

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

// Check if current page is homepage
const isHomePage = computed(() => route.path === '/' || route.path === '/home')

// SVG Icon Components
const SunIcon: Component = {
  render: () =>
    h(
      'svg',
      { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', 'stroke-width': '1.5' },
      [
        h('path', {
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          d: 'M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z'
        })
      ]
    )
}

const MoonIcon: Component = {
  render: () =>
    h(
      'svg',
      { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', 'stroke-width': '1.5' },
      [
        h('path', {
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          d: 'M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z'
        })
      ]
    )
}
</script>
