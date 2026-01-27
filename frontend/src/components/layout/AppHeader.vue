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

      <!-- Right: Docs -->
      <div class="flex items-center gap-3">
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
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores'
import Icon from '@/components/icons/Icon.vue'

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
</script>
