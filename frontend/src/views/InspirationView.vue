<template>
  <div class="inspiration-page min-h-screen bg-gray-50 dark:bg-dark-950">
    <!-- Header with Navigation -->
    <header class="sticky top-0 z-50 border-b border-gray-200/70 bg-white/80 backdrop-blur-md dark:border-dark-700/70 dark:bg-dark-900/80">
      <nav class="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <router-link to="/home" class="flex items-center gap-3">
          <div class="h-10 w-10 overflow-hidden rounded-xl shadow-md">
            <img :src="siteLogo || '/logo.png'" alt="Logo" class="h-full w-full object-contain" />
          </div>
          <span class="hidden text-sm font-semibold text-gray-900 dark:text-white sm:inline">
            {{ siteName }}
          </span>
        </router-link>

        <div class="flex items-center gap-3">
          <LocaleSwitcher />
          <router-link
            v-if="isAuthenticated"
            :to="dashboardPath"
            class="studio-pill bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            {{ t('nav.dashboard') }}
          </router-link>
          <router-link
            v-else
            to="/login"
            class="studio-pill bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            {{ t('nav.login') }}
          </router-link>
        </div>
      </nav>
    </header>

    <!-- Hero Section -->
    <section class="hero bg-gradient-to-br from-orange-50 via-white to-teal-50 py-16 dark:from-orange-900/10 dark:via-dark-900 dark:to-teal-900/10">
      <div class="mx-auto max-w-7xl px-6 text-center">
        <h1 class="text-4xl font-bold text-gray-900 dark:text-white md:text-5xl">
          {{ t('inspiration.title') }}
        </h1>
        <p class="mt-4 text-lg text-gray-600 dark:text-gray-400">
          {{ t('inspiration.subtitle') }}
        </p>
      </div>
    </section>

    <!-- Filters -->
    <div class="sticky top-[73px] z-40 border-b border-gray-200/70 bg-white/80 backdrop-blur-md dark:border-dark-700/70 dark:bg-dark-900/80">
      <div class="mx-auto flex max-w-7xl items-center gap-2 px-6 py-3">
        <button
          type="button"
          class="studio-tab"
          :class="{ 'studio-tab-active': sortBy === 'latest' }"
          @click="sortBy = 'latest'"
        >
          <Icon name="clock" size="sm" />
          {{ t('inspiration.latest') }}
        </button>
        <button
          type="button"
          class="studio-tab"
          :class="{ 'studio-tab-active': sortBy === 'popular' }"
          @click="sortBy = 'popular'"
        >
          <Icon name="fire" size="sm" />
          {{ t('inspiration.popular') }}
        </button>
      </div>
    </div>

    <!-- Masonry Grid -->
    <main class="mx-auto max-w-7xl px-6 py-8">
      <div v-if="loading" class="text-center text-sm text-gray-500 dark:text-gray-400">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="error" class="text-center text-sm text-red-500">
        {{ error }}
      </div>
      <EmptyState
        v-else-if="inspirationItems.length === 0"
        :title="t('inspiration.emptyTitle')"
        :description="t('inspiration.emptyDescription')"
      >
        <template #icon>
          <div
            class="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 dark:bg-dark-800"
          >
            <Icon name="sparkles" size="lg" />
          </div>
        </template>
      </EmptyState>
      <div
        v-else
        class="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      >
        <article
          v-for="item in inspirationItems"
          :key="item.id"
          class="inspiration-card group cursor-pointer overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-card transition-all duration-300 hover:scale-105 hover:shadow-card-hover dark:border-dark-700/70 dark:bg-dark-900/70"
          @click="openDetail(item)"
        >
          <div class="relative aspect-[4/5] overflow-hidden bg-gray-100 dark:bg-dark-800">
            <img
              :src="item.image_url"
              :alt="item.prompt || t('gallery.promptFallback')"
              loading="lazy"
              class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
            />
            <div
              class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            ></div>
            <div
              class="absolute inset-x-0 bottom-0 translate-y-full p-4 transition-transform duration-300 group-hover:translate-y-0"
            >
              <p class="line-clamp-2 text-xs text-white">
                {{ item.prompt || t('gallery.promptFallback') }}
              </p>
              <div class="mt-2 flex items-center justify-between text-xs text-white/80">
                <span>{{ item.user_name || t('common.anonymous') }}</span>
                <span>{{ formatDate(item.created_at) }}</span>
              </div>
            </div>
          </div>
        </article>
      </div>

      <!-- Load More -->
      <div v-if="hasMore" class="mt-8 text-center">
        <button
          type="button"
          class="studio-pill bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
          :disabled="loadingMore"
          @click="loadMore"
        >
          <Icon v-if="loadingMore" name="refresh" size="sm" class="animate-spin" />
          <Icon v-else name="chevronDown" size="sm" />
          {{ loadingMore ? t('common.loading') : t('inspiration.loadMore') }}
        </button>
      </div>
    </main>

    <!-- Detail Modal -->
    <BaseDialog
      :show="detailOpen"
      :title="t('inspiration.detailTitle')"
      width="full"
      content-class="studio-dialog"
      :close-on-click-outside="true"
      @close="closeDetail"
    >
      <div v-if="selectedItem" class="flex flex-col gap-6 lg:flex-row">
        <div class="flex-1">
          <div class="studio-card p-3">
            <div
              class="relative flex items-center justify-center overflow-hidden rounded-2xl bg-gray-100 dark:bg-dark-800"
            >
              <img
                :src="selectedItem.image_url"
                :alt="selectedItem.prompt || t('gallery.promptFallback')"
                class="max-h-[70vh] w-auto rounded-2xl object-contain"
              />
            </div>
          </div>
        </div>
        <div class="w-full lg:w-72">
          <div class="studio-card p-4 text-sm">
            <div class="space-y-3">
              <div>
                <p class="text-xs font-semibold text-gray-500 dark:text-dark-400">
                  {{ t('inspiration.detailPrompt') }}
                </p>
                <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">
                  {{ selectedItem.prompt || t('gallery.promptFallback') }}
                </p>
              </div>
              <div>
                <p class="text-xs font-semibold text-gray-500 dark:text-dark-400">
                  {{ t('inspiration.detailAuthor') }}
                </p>
                <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">
                  {{ selectedItem.user_name || t('common.anonymous') }}
                </p>
              </div>
              <div>
                <p class="text-xs font-semibold text-gray-500 dark:text-dark-400">
                  {{ t('inspiration.detailCreatedAt') }}
                </p>
                <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">
                  {{ formatDate(selectedItem.created_at) }}
                </p>
              </div>
            </div>
          </div>
          <div class="mt-4 grid gap-2">
            <button type="button" class="studio-pill" @click="copyPrompt">
              <Icon name="copy" size="xs" />
              {{ t('gallery.actions.copyPrompt') }}
            </button>
            <button type="button" class="studio-pill" @click="downloadImage">
              <Icon name="download" size="xs" />
              {{ t('gallery.actions.downloadImage') }}
            </button>
          </div>
        </div>
      </div>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore, useAppStore } from '@/stores'
import { useClipboard } from '@/composables/useClipboard'
import { listPublicGallery } from '@/api/gallery'
import type { GalleryImage } from '@/types'
import LocaleSwitcher from '@/components/common/LocaleSwitcher.vue'
import Icon from '@/components/icons/Icon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'

const { t } = useI18n()
const authStore = useAuthStore()
const appStore = useAppStore()
const { copyToClipboard } = useClipboard()

const siteName = computed(
  () => appStore.cachedPublicSettings?.site_name || appStore.siteName || 'DreamStudio'
)
const siteLogo = computed(() => appStore.cachedPublicSettings?.site_logo || appStore.siteLogo || '')
const isAuthenticated = computed(() => authStore.isAuthenticated)
const dashboardPath = computed(() => (authStore.isAdmin ? '/admin/dashboard' : '/dashboard'))

const sortBy = ref<'latest' | 'popular'>('latest')
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const loadingMore = ref(false)
const error = ref('')
const inspirationItems = ref<GalleryImage[]>([])
const hasMore = ref(true)
const detailOpen = ref(false)
const selectedItem = ref<GalleryImage | null>(null)

async function fetchInspiration(append = false) {
  if (append) {
    loadingMore.value = true
  } else {
    loading.value = true
    error.value = ''
  }

  try {
    const data = await listPublicGallery({
      page: page.value,
      page_size: pageSize
    })

    if (append) {
      inspirationItems.value = [...inspirationItems.value, ...(data.items || [])]
    } else {
      inspirationItems.value = data.items || []
    }

    hasMore.value = (data.items || []).length === pageSize
  } catch (err: any) {
    error.value = err?.message || t('inspiration.loadFailed')
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

function loadMore() {
  page.value += 1
  fetchInspiration(true)
}

function openDetail(item: GalleryImage) {
  selectedItem.value = item
  detailOpen.value = true
}

function closeDetail() {
  detailOpen.value = false
  selectedItem.value = null
}

async function copyPrompt() {
  if (!selectedItem.value) return
  await copyToClipboard(selectedItem.value.prompt || t('gallery.promptFallback'))
}

async function downloadImage() {
  if (!selectedItem.value) return
  try {
    const response = await fetch(selectedItem.value.image_url)
    if (!response.ok) throw new Error('Download failed')
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = `inspiration-${selectedItem.value.id}.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    window.open(selectedItem.value.image_url, '_blank', 'noopener,noreferrer')
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return t('common.today')
  if (days === 1) return t('common.yesterday')
  if (days < 7) return t('common.daysAgoSimple', { days })
  return date.toLocaleDateString()
}

watch(sortBy, () => {
  page.value = 1
  fetchInspiration()
})

onMounted(() => {
  fetchInspiration()
})
</script>
