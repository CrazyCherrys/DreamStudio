<template>
  <AppLayout>
    <div class="assets-page space-y-6 p-6">
      <!-- Toolbar -->
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between animate-slide-up">
        <!-- Tabs -->
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="studio-tab"
            :class="{ 'studio-tab-active': activeTab === 'all' }"
            @click="activeTab = 'all'"
          >
            <Icon name="folder" size="sm" />
            {{ t('assets.all') }}
          </button>
          <button
            type="button"
            class="studio-tab"
            :class="{ 'studio-tab-active': activeTab === 'images' }"
            @click="activeTab = 'images'"
          >
            <Icon name="sparkles" size="sm" />
            {{ t('assets.images') }}
          </button>
          <button
            type="button"
            class="studio-tab"
            :class="{ 'studio-tab-active': activeTab === 'videos' }"
            @click="activeTab = 'videos'"
          >
            <Icon name="play" size="sm" />
            {{ t('assets.videos') }}
          </button>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-3">
          <!-- Sort -->
          <button class="btn btn-secondary text-xs" @click="toggleSort">
            <Icon :name="sortOrder === 'desc' ? 'sortDesc' : 'sortAsc'" size="sm" />
            {{ sortOrder === 'desc' ? t('assets.sortNewest') : t('assets.sortOldest') }}
          </button>

          <!-- Favorites Filter -->
          <label class="flex items-center gap-2 cursor-pointer select-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50 dark:border-dark-700 dark:bg-dark-800 dark:hover:bg-dark-700">
            <input type="checkbox" v-model="showFavoritesOnly" class="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            <span class="flex items-center gap-1">
              <Icon name="heart" size="xs" class="text-red-500" />
              {{ t('assets.favorites') }}
            </span>
          </label>

          <!-- Batch Mode Toggle -->
          <button
            class="btn"
            :class="isBatchMode ? 'btn-primary' : 'btn-secondary'"
            @click="toggleBatchMode"
          >
            {{ isBatchMode ? t('assets.exitBatchMode') : t('assets.batchMode') }}
          </button>
        </div>
      </div>

      <!-- Asset Grid -->
      <div class="animate-slide-up pb-20">
        <div v-if="loading" class="text-center text-sm text-gray-500 dark:text-gray-400">
          {{ t('common.loading') }}
        </div>
        <div v-else-if="error" class="text-center text-sm text-red-500">
          {{ error }}
        </div>
        <EmptyState
          v-else-if="filteredAssets.length === 0"
          :title="t('assets.emptyTitle')"
          :description="t('assets.emptyDescription')"
        >
          <template #icon>
            <div
              class="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 dark:bg-dark-800"
            >
              <Icon name="folder" size="lg" />
            </div>
          </template>
        </EmptyState>
        <AssetGrid
          v-else
          :items="filteredAssets"
          :is-batch-mode="isBatchMode"
          :selected-ids="selectedIds"
          :favorites="favorites"
          @download="handleDownload"
          @delete="handleDelete"
          @submit="handleSubmitToInspiration"
          @toggle-favorite="handleToggleFavorite"
          @toggle-selection="handleToggleSelection"
          @open-detail="handleOpenDetail"
        />
      </div>

      <!-- Pagination -->
      <div v-if="totalPages > 1 && !isBatchMode" class="flex justify-center">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="studio-pill"
            :disabled="page === 1"
            @click="page = Math.max(1, page - 1)"
          >
            <Icon name="chevronLeft" size="sm" />
            {{ t('common.previousPage') }}
          </button>
          <span class="text-sm text-gray-600 dark:text-gray-400">
            {{ page }} / {{ totalPages }}
          </span>
          <button
            type="button"
            class="studio-pill"
            :disabled="page === totalPages"
            @click="page = Math.min(totalPages, page + 1)"
          >
            {{ t('common.nextPage') }}
            <Icon name="chevronRight" size="sm" />
          </button>
        </div>
      </div>

      <!-- Batch Action Bar -->
      <div v-if="isBatchMode" class="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-2xl bg-white/90 px-6 py-4 shadow-xl backdrop-blur-lg dark:bg-dark-800/90 border border-gray-200 dark:border-dark-700">
        <span class="font-medium text-gray-900 dark:text-white">{{ t('assets.selected', { count: selectedIds.size }) }}</span>
        <div class="h-6 w-px bg-gray-200 dark:bg-dark-700"></div>
        <button class="btn btn-secondary btn-sm" @click="handleBatchFavorite">
          <Icon name="heart" size="sm" /> {{ t('assets.favorite') }}
        </button>
        <button class="btn btn-secondary btn-sm" @click="handleBatchDownload" :disabled="selectedIds.size === 0">
          <Icon name="download" size="sm" /> {{ t('assets.download') }}
        </button>
        <button class="btn btn-danger btn-sm" @click="handleBatchDelete" :disabled="selectedIds.size === 0">
          <Icon name="trash" size="sm" /> {{ t('assets.delete') }}
        </button>
        <div class="h-6 w-px bg-gray-200 dark:bg-dark-700"></div>
        <button class="btn btn-ghost btn-sm" @click="toggleBatchMode">
          <Icon name="close" size="sm" />
        </button>
      </div>

      <!-- Detail Modal -->
      <AssetDetailModal
        v-if="selectedAsset"
        :show="!!selectedAsset"
        :asset="selectedAsset"
        @close="selectedAsset = null"
        @download="handleDownload"
        @submit="handleSubmitToInspiration"
      />
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores'
import { listUserGallery, submitGalleryImage } from '@/api/gallery'
import { videosAPI } from '@/api'
import { useAssetFavorites } from '@/composables/useAssetFavorites'
import type { GalleryImage } from '@/types'
import AppLayout from '@/components/layout/AppLayout.vue'
import Icon from '@/components/icons/Icon.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import AssetGrid from '@/components/assets/AssetGrid.vue'
import AssetDetailModal from '@/components/assets/AssetDetailModal.vue'

const { t } = useI18n()
const appStore = useAppStore()
const { favorites, toggleFavorite } = useAssetFavorites()

type AssetType = 'image' | 'video'

interface Asset {
  id: number
  type: AssetType
  url: string
  thumbnail?: string
  createdAt: string
  submissionStatus?: string
  prompt?: string
}

const activeTab = ref<'all' | 'images' | 'videos'>('all')
const page = ref(1)
const pageSize = 12
const loading = ref(false)
const error = ref('')
const sortOrder = ref<'asc' | 'desc'>('desc')
const showFavoritesOnly = ref(false)
const isBatchMode = ref(false)
const selectedIds = ref(new Set<string>())
const selectedAsset = ref<Asset | null>(null)

const images = ref<Asset[]>([])
const videos = ref<Asset[]>([])

const allAssets = computed(() => {
  let assets = [...images.value, ...videos.value]

  // Filter favorites
  if (showFavoritesOnly.value) {
    assets = assets.filter(a => favorites.value.has(`${a.type}-${a.id}`))
  }

  // Sort
  assets.sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime()
    const dateB = new Date(b.createdAt).getTime()
    return sortOrder.value === 'desc' ? dateB - dateA : dateA - dateB
  })

  return assets
})

const filteredAssets = computed(() => {
  let assets = allAssets.value
  if (activeTab.value === 'images') {
    assets = assets.filter(a => a.type === 'image')
  } else if (activeTab.value === 'videos') {
    assets = assets.filter(a => a.type === 'video')
  }

  const start = (page.value - 1) * pageSize
  return assets.slice(start, start + pageSize)
})

const totalPages = computed(() => {
  let assets = allAssets.value
  if (activeTab.value === 'images') {
    assets = assets.filter(a => a.type === 'image')
  } else if (activeTab.value === 'videos') {
    assets = assets.filter(a => a.type === 'video')
  }
  return Math.ceil(assets.length / pageSize)
})

async function fetchAssets() {
  loading.value = true
  error.value = ''

  try {
    const [imagesResult, videosResult] = await Promise.allSettled([
      listUserGallery({ page: 1, page_size: 100 }),
      videosAPI.listVideoHistory({ page: 1, page_size: 100 })
    ])
    const warnings: string[] = []

    if (imagesResult.status === 'fulfilled') {
      const imagesData = imagesResult.value
      images.value = (imagesData.items || []).map((img: GalleryImage) => ({
        id: img.id,
        type: 'image' as AssetType,
        url: img.image_url,
        thumbnail: img.thumbnail_url || img.image_url,
        createdAt: img.created_at,
        submissionStatus: img.submission_status,
        prompt: img.prompt || undefined
      }))
    } else {
      images.value = []
      warnings.push(t('assets.imagesLoadFailed'))
    }

    if (videosResult.status === 'fulfilled') {
      const videosData = videosResult.value
      videos.value = (videosData.items || []).map((vid: any) => ({
        id: vid.id,
        type: 'video' as AssetType,
        url: vid.primary_video?.video_url || vid.video_urls?.[0] || '',
        thumbnail: vid.primary_video?.thumbnail_url || '',
        createdAt: vid.created_at,
        submissionStatus: undefined,
        prompt: vid.prompt
      }))
    } else {
      videos.value = []
      warnings.push(t('assets.videosLoadFailed'))
    }

    if (warnings.length === 2) {
      error.value = t('assets.loadFailed')
    } else if (warnings.length === 1) {
      appStore.showWarning(warnings[0])
    }
  } catch (err: any) {
    error.value = err?.message || t('assets.loadFailed')
  } finally {
    loading.value = false
  }
}

async function handleDownload(asset: Asset) {
  try {
    const response = await fetch(asset.url)
    if (!response.ok) throw new Error('Download failed')
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = `asset-${asset.id}.${asset.type === 'video' ? 'mp4' : 'png'}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    window.open(asset.url, '_blank', 'noopener,noreferrer')
  }
}

async function handleDelete(asset: Asset) {
  const confirmed = window.confirm(t('assets.deleteConfirm'))
  if (!confirmed) return

  try {
    console.log('Delete asset:', asset)
    appStore.showWarning(t('assets.deleteNotImplemented'))
  } catch (err: any) {
    appStore.showError(err?.message || t('assets.deleteFailed'))
  }
}

async function handleSubmitToInspiration(asset: Asset) {
  if (asset.type !== 'image') {
    appStore.showWarning(t('assets.videoSubmitNotSupported'))
    return
  }

  try {
    await submitGalleryImage({ image_url: asset.url })
    appStore.showSuccess(t('assets.submitSuccess'))
    await fetchAssets()
  } catch (err: any) {
    appStore.showError(err?.message || t('assets.submitFailed'))
  }
}

function toggleSort() {
  sortOrder.value = sortOrder.value === 'desc' ? 'asc' : 'desc'
}

function toggleBatchMode() {
  isBatchMode.value = !isBatchMode.value
  selectedIds.value.clear()
}

function handleToggleFavorite(asset: Asset) {
  toggleFavorite(`${asset.type}-${asset.id}`)
}

function handleToggleSelection(asset: Asset) {
  const key = `${asset.type}-${asset.id}`
  if (selectedIds.value.has(key)) {
    selectedIds.value.delete(key)
  } else {
    selectedIds.value.add(key)
  }
  selectedIds.value = new Set(selectedIds.value)
}

function handleOpenDetail(asset: Asset) {
  selectedAsset.value = asset
}

function handleBatchFavorite() {
  selectedIds.value.forEach((key) => {
    if (!favorites.value.has(key)) {
      toggleFavorite(key)
    }
  })
  appStore.showSuccess(t('common.success'))
  isBatchMode.value = false
  selectedIds.value.clear()
}

async function handleBatchDownload() {
  const assets = allAssets.value.filter(a => selectedIds.value.has(`${a.type}-${a.id}`))
  for (const asset of assets) {
    await handleDownload(asset)
  }
}

function handleBatchDelete() {
  appStore.showWarning(t('assets.deleteNotImplemented'))
}

watch([activeTab, sortOrder, showFavoritesOnly], () => {
  page.value = 1
})

onMounted(() => {
  fetchAssets()
})
</script>
