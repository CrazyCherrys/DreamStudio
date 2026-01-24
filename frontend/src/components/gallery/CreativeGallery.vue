<template>
  <div class="space-y-4">
    <div v-if="loading" :class="gridClass">
      <div
        v-for="n in skeletonCount"
        :key="n"
        class="relative overflow-hidden rounded-2xl border border-white/30 bg-white/70 shadow-card backdrop-blur-sm dark:border-dark-700/60 dark:bg-dark-900/60"
      >
        <Skeleton class="w-full aspect-[4/5]" />
        <div class="absolute left-3 top-3">
          <Skeleton class="h-4 w-14" />
        </div>
        <div class="absolute inset-x-3 bottom-3 space-y-2">
          <Skeleton class="h-3 w-4/5" variant="text" />
          <Skeleton class="h-3 w-2/3" variant="text" />
        </div>
      </div>
    </div>

    <div v-else-if="error" class="text-sm text-red-500">
      {{ error }}
    </div>

    <EmptyState
      v-else-if="images.length === 0"
      :title="t('gallery.emptyTitle')"
      :description="t('gallery.emptyDescription')"
    >
      <template #icon>
        <div
          class="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-500 dark:bg-dark-800"
        >
          <Icon name="sparkles" size="lg" />
        </div>
      </template>
    </EmptyState>

    <div v-else :class="gridClass">
      <article
        v-for="image in images"
        :key="image.id"
        class="group cursor-zoom-in overflow-hidden rounded-2xl border border-white/30 bg-white/70 shadow-card transition duration-300 hover:-translate-y-1 hover:shadow-card-hover dark:border-dark-700/60 dark:bg-dark-900/70"
        @click="openDetail(image)"
      >
        <div
          class="creative-swap relative aspect-[4/5] overflow-hidden rounded-2xl bg-gray-100 dark:bg-dark-800"
        >
          <img
            :src="image.thumbnail_url || image.image_url"
            :alt="promptText(image)"
            loading="lazy"
            class="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
          <img
            v-if="referenceImageSource(image)"
            :src="referenceImageSource(image)"
            alt=""
            loading="lazy"
            class="creative-swap-overlay transition duration-500 group-hover:scale-105"
          />
        </div>
      </article>
    </div>

    <Pagination
      v-if="showPagination && total > pageSize"
      :total="total"
      :page="page"
      :page-size="pageSize"
      :show-page-size-selector="false"
      @update:page="handlePageChange"
    />
  </div>

  <BaseDialog
    :show="detailOpen"
    :title="t('home.history.detailTitle')"
    width="full"
    content-class="studio-dialog"
    :close-on-click-outside="true"
    @close="closeDetail"
  >
    <div v-if="detailImage" class="flex flex-col gap-6 lg:flex-row">
      <div class="flex-1">
        <div class="studio-card p-3">
          <div
            class="relative flex items-center justify-center overflow-hidden rounded-2xl bg-gray-100 dark:bg-dark-800"
          >
            <img
              v-if="detailImageUrl"
              :src="detailImageUrl"
              :alt="detailPrompt"
              class="max-h-[70vh] w-auto rounded-2xl object-contain"
            />
            <div
              v-else
              class="flex h-[320px] w-full items-center justify-center text-gray-500 dark:text-dark-300"
            >
              <Icon name="refresh" size="sm" class="animate-spin" />
            </div>
            <div
              v-if="detailPromptVisible"
              class="absolute inset-x-4 bottom-16 rounded-2xl bg-black/70 p-4 text-xs text-white backdrop-blur"
            >
              {{ detailPrompt }}
            </div>
            <div class="absolute bottom-4 right-4 flex gap-2">
              <button
                type="button"
                class="studio-icon-button"
                :title="t('home.history.showPrompt')"
                @click="toggleDetailPrompt"
              >
                <Icon name="chat" size="xs" />
              </button>
              <button
                type="button"
                class="studio-icon-button"
                :title="t('gallery.actions.copyPrompt')"
                @click="copyDetailPrompt"
              >
                <Icon name="copy" size="xs" />
              </button>
              <button
                type="button"
                class="studio-icon-button"
                :title="t('gallery.actions.downloadImage')"
                :class="detailImageUrl ? '' : 'pointer-events-none opacity-60'"
                @click="downloadDetailImage"
              >
                <Icon name="download" size="xs" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="w-full lg:w-72">
        <div class="studio-card p-4 text-sm">
          <div class="space-y-3">
            <div>
              <p class="text-xs font-semibold text-gray-500 dark:text-dark-400">
                {{ t('home.history.detailModel') }}
              </p>
              <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">
                {{ detailModel }}
              </p>
            </div>
            <div>
              <p class="text-xs font-semibold text-gray-500 dark:text-dark-400">
                {{ t('home.history.detailDisplayName') }}
              </p>
              <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">
                {{ detailModelDisplayName }}
              </p>
            </div>
            <div v-if="detailSize">
              <p class="text-xs font-semibold text-gray-500 dark:text-dark-400">
                {{ t('home.generator.resolutionLabel') }}
              </p>
              <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">
                {{ detailSize }}
              </p>
            </div>
            <div>
              <p class="text-xs font-semibold text-gray-500 dark:text-dark-400">
                {{ t('home.history.detailCreatedAt') }}
              </p>
              <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">
                {{ formatDateTime(detailImage?.created_at) }}
              </p>
            </div>
            <div>
              <p class="text-xs font-semibold text-gray-500 dark:text-dark-400">
                {{ t('home.history.detailSubmission') }}
              </p>
              <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">
                {{ detailSubmissionLabel }}
              </p>
            </div>
            <div>
              <p class="text-xs font-semibold text-gray-500 dark:text-dark-400">
                {{ t('home.history.detailPublic') }}
              </p>
              <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">
                {{ detailImage?.is_public ? t('common.yes') : t('common.no') }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useClipboard } from '@/composables/useClipboard'
import { listPublicGallery } from '@/api/gallery'
import type { GalleryImage } from '@/types'
import Pagination from '@/components/common/Pagination.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import Skeleton from '@/components/common/Skeleton.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import { formatDateTime } from '@/utils/format'

const props = withDefaults(defineProps<{
  variant?: 'panel' | 'page'
  pageSize?: number
  showPagination?: boolean
  modelDisplayNames?: Record<string, string>
}>(), {
  variant: 'panel',
  pageSize: 12,
  showPagination: true,
  modelDisplayNames: () => ({})
})

const { t } = useI18n()
const { copyToClipboard } = useClipboard()

const images = ref<GalleryImage[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const error = ref('')

const pageSize = computed(() => props.pageSize)
const showPagination = computed(() => props.showPagination)

const gridClass = computed(() =>
  props.variant === 'page'
    ? 'grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
    : 'grid gap-3 sm:grid-cols-2'
)

const skeletonCount = computed(() => (props.variant === 'page' ? 8 : 4))

const promptText = (image: GalleryImage): string => {
  return image.prompt?.trim() || t('gallery.promptFallback')
}

const referenceImageSource = (image: GalleryImage): string => {
  const ref = image.reference_image_url?.trim() || ''
  if (!ref) return ''
  const primary = (image.thumbnail_url || image.image_url || '').trim()
  if (primary && primary === ref) return ''
  return ref
}

const detailOpen = ref(false)
const detailImage = ref<GalleryImage | null>(null)
const detailPromptVisible = ref(false)

const detailImageUrl = computed(() => detailImage.value?.image_url || detailImage.value?.thumbnail_url || '')
const detailPrompt = computed(() => (detailImage.value ? promptText(detailImage.value) : ''))
const detailModel = computed(() => detailImage.value?.model || t('gallery.modelFallback'))
const detailModelDisplayName = computed(() => {
  const modelId = detailImage.value?.model?.trim()
  if (!modelId) return t('gallery.modelFallback')
  const displayName = props.modelDisplayNames?.[modelId]?.trim()
  return displayName || modelId
})
const detailSize = computed(() => {
  const width = detailImage.value?.width
  const height = detailImage.value?.height
  if (!width || !height) return ''
  return `${width} x ${height}`
})
const detailSubmissionLabel = computed(() => {
  const status = detailImage.value?.submission_status || 'none'
  switch (status) {
    case 'pending':
      return t('home.history.submissionPending')
    case 'approved':
      return t('home.history.submissionApproved')
    case 'rejected':
      return t('home.history.submissionRejected')
    default:
      return t('home.history.submissionNone')
  }
})

async function fetchGallery() {
  loading.value = true
  error.value = ''
  try {
    const data = await listPublicGallery({ page: page.value, page_size: props.pageSize })
    images.value = data.items || []
    total.value = data.total || 0
  } catch (err: any) {
    images.value = []
    total.value = 0
    error.value = err?.message || t('gallery.loadFailed')
  } finally {
    loading.value = false
  }
}

function handlePageChange(nextPage: number) {
  page.value = nextPage
}

async function downloadImage(image: GalleryImage) {
  const url = image.image_url
  if (!url) return

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Download failed')
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = `dreamstudio-${image.id || 'image'}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

function openDetail(image: GalleryImage) {
  detailImage.value = image
  detailPromptVisible.value = false
  detailOpen.value = true
}

function closeDetail() {
  detailOpen.value = false
  detailPromptVisible.value = false
  detailImage.value = null
}

function toggleDetailPrompt() {
  if (!detailPrompt.value) return
  detailPromptVisible.value = !detailPromptVisible.value
}

async function copyDetailPrompt() {
  if (!detailPrompt.value) return
  await copyToClipboard(detailPrompt.value)
}

async function downloadDetailImage() {
  const url = detailImageUrl.value
  if (!url) return
  await downloadImage({ ...detailImage.value!, image_url: url })
}

watch([page, () => props.pageSize], () => {
  fetchGallery()
})

onMounted(() => {
  fetchGallery()
})
</script>
