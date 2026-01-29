<template>
  <AppLayout>
    <div class="hub-container space-y-8 p-6">
      <!-- Welcome Section -->
      <section class="welcome-section animate-slide-up">
        <div class="studio-card p-6 md:p-8">
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white md:text-4xl">
            {{ t('hub.welcome', { name: userName }) }}
          </h1>
          <div class="mt-4 flex items-center gap-3">
            <div
              class="flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-50 to-teal-50 px-4 py-2 dark:from-orange-900/20 dark:to-teal-900/20"
            >
              <Icon name="coins" size="md" class="text-orange-600 dark:text-orange-400" />
              <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {{ t('hub.balance') }}: {{ userBalance }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Tool Cards Grid -->
      <section class="tools-grid">
        <h2 class="mb-4 text-xl font-semibold text-gray-800 dark:text-gray-200">
          {{ t('hub.toolsTitle') }}
        </h2>
        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <router-link
            v-for="tool in tools"
            :key="tool.path"
            :to="tool.path"
            class="tool-card group animate-slide-up overflow-hidden rounded-2xl border border-gray-200/70 bg-white/70 p-6 shadow-card transition-all duration-300 hover:scale-105 hover:shadow-card-hover dark:border-dark-700/70 dark:bg-dark-900/70"
          >
            <div
              class="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-100 to-teal-100 dark:from-orange-900/30 dark:to-teal-900/30"
            >
              <Icon :name="tool.icon" size="xl" class="text-orange-600 dark:text-orange-400" />
            </div>
            <h3 class="mb-2 text-lg font-bold text-gray-900 dark:text-white">
              {{ tool.title }}
            </h3>
            <p class="mb-4 text-sm text-gray-600 dark:text-gray-400">
              {{ tool.description }}
            </p>
            <div
              class="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors group-hover:bg-gray-800 dark:bg-gray-800 dark:group-hover:bg-gray-700"
            >
              <Icon name="sparkles" size="sm" />
              {{ t('hub.startCreating') }}
            </div>
          </router-link>
        </div>
      </section>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores'
import AppLayout from '@/components/layout/AppLayout.vue'
import Icon from '@/components/icons/Icon.vue'

const { t } = useI18n()
const authStore = useAuthStore()

const userName = computed(() => {
  const user = authStore.user
  if (!user) return t('common.guest')
  return user.username || user.email?.split('@')[0] || t('common.user')
})

const userBalance = computed(() => {
  const user = authStore.user
  if (!user || typeof user.balance !== 'number') return '0'
  return user.balance.toLocaleString()
})

const tools = computed<Array<{
  path: string
  icon: 'sparkles' | 'play' | 'lightbulb'
  title: string
  description: string
}>>(() => [
  {
    path: '/ai-image',
    icon: 'sparkles' as const,
    title: t('nav.aiImage'),
    description: t('hub.imageDesc')
  },
  {
    path: '/ai-video',
    icon: 'play' as const,
    title: t('nav.aiVideo'),
    description: t('hub.videoDesc')
  },
  {
    path: '/redink',
    icon: 'lightbulb' as const,
    title: t('nav.redink'),
    description: t('hub.redinkDesc')
  }
])
</script>
