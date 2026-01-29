<template>
  <div class="asset-grid grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
    <article
      v-for="item in items"
      :key="`${item.type}-${item.id}`"
      class="asset-card group overflow-hidden rounded-2xl border border-gray-200/70 bg-white shadow-card transition-all duration-300 hover:shadow-card-hover dark:border-dark-700/70 dark:bg-dark-900/70"
      :class="{ 'ring-2 ring-primary-500': isSelected(item) }"
    >
      <!-- Thumbnail -->
      <button
        type="button"
        class="relative w-full aspect-[4/5] overflow-hidden bg-gray-100 dark:bg-dark-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
        @click="handleCardClick(item)"
      >
        <img
          v-if="item.type === 'image'"
          :src="item.thumbnail || item.url"
          :alt="item.prompt || 'Asset'"
          loading="lazy"
          class="h-full w-full object-cover"
        />
        <video
          v-else
          :src="item.url"
          class="h-full w-full object-cover"
          preload="metadata"
          playsinline
        ></video>

        <!-- Type Badge -->
        <div class="absolute left-2 top-2">
          <span
            class="inline-flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm"
          >
            <Icon :name="item.type === 'image' ? 'sparkles' : 'play'" size="xs" />
            {{ item.type === 'image' ? t('assets.image') : t('assets.video') }}
          </span>
        </div>

        <!-- Selection / Favorite Overlay -->
        <div class="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10 group-focus-within:bg-black/10">
          <!-- Batch Mode Checkbox -->
          <div v-if="isBatchMode" class="absolute left-2 bottom-2 z-10">
            <div
              class="h-6 w-6 rounded-full border-2 border-white bg-black/20 text-white transition-all flex items-center justify-center"
              :class="{ 'bg-primary-500 border-primary-500': isSelected(item) }"
            >
              <Icon v-if="isSelected(item)" name="check" size="xs" />
            </div>
          </div>

          <!-- Favorite Button -->
          <button
            v-if="!isBatchMode"
            type="button"
            class="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 p-1 rounded-full bg-black/20 backdrop-blur-sm"
            :class="{ 'opacity-100': isFavorited(item) }"
            @click.stop="$emit('toggle-favorite', item)"
          >
            <Icon
              :name="isFavorited(item) ? 'heartFilled' : 'heart'"
              class="text-white drop-shadow-md"
              :class="{ 'text-red-500': isFavorited(item) }"
            />
          </button>
        </div>

        <!-- Submission Status Badge -->
        <div v-if="item.submissionStatus" class="absolute right-2 bottom-2 pointer-events-none">
          <span
            class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold backdrop-blur-sm"
            :class="submissionStatusClass(item.submissionStatus)"
          >
            <Icon :name="submissionStatusIcon(item.submissionStatus)" size="xs" />
            {{ submissionStatusLabel(item.submissionStatus) }}
          </span>
        </div>
      </button>

      <!-- Actions -->
      <div class="p-3">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {{ formatDate(item.createdAt) }}
          </span>
          <div class="flex items-center gap-1" v-if="!isBatchMode">
            <button
              type="button"
              class="studio-icon-button"
              :title="t('assets.download')"
              @click.stop="$emit('download', item)"
            >
              <Icon name="download" size="xs" />
            </button>
            <button
              v-if="canSubmit(item)"
              type="button"
              class="studio-icon-button"
              :title="t('assets.submitToInspiration')"
              @click.stop="$emit('submit', item)"
            >
              <Icon name="upload" size="xs" />
            </button>
            <button
              type="button"
              class="studio-icon-button text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              :title="t('assets.delete')"
              @click.stop="$emit('delete', item)"
            >
              <Icon name="trash" size="xs" />
            </button>
          </div>
        </div>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Icon from '@/components/icons/Icon.vue'

const { t } = useI18n()

interface Asset {
  id: number
  type: 'image' | 'video'
  url: string
  thumbnail?: string
  createdAt: string
  submissionStatus?: string
  prompt?: string
}

const props = defineProps<{
  items: Asset[]
  isBatchMode?: boolean
  selectedIds?: Set<string>
  favorites?: Set<string>
}>()

const emit = defineEmits<{
  download: [asset: Asset]
  delete: [asset: Asset]
  submit: [asset: Asset]
  'toggle-favorite': [asset: Asset]
  'toggle-selection': [asset: Asset]
  'open-detail': [asset: Asset]
}>()

function getAssetKey(item: Asset) {
  return `${item.type}-${item.id}`
}

function isSelected(item: Asset) {
  return props.selectedIds?.has(getAssetKey(item))
}

function isFavorited(item: Asset) {
  return props.favorites?.has(getAssetKey(item))
}

function handleCardClick(item: Asset) {
  if (props.isBatchMode) {
    emit('toggle-selection', item)
  } else {
    emit('open-detail', item)
  }
}

function canSubmit(item: Asset): boolean {
  if (item.type !== 'image') return false
  if (!item.submissionStatus) return true
  return item.submissionStatus === 'rejected'
}

function submissionStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return t('assets.submissionPending')
    case 'approved':
      return t('assets.submissionApproved')
    case 'rejected':
      return t('assets.submissionRejected')
    default:
      return status
  }
}

function submissionStatusIcon(status: string): 'clock' | 'check' | 'xCircle' | 'infoCircle' {
  switch (status) {
    case 'pending':
      return 'clock'
    case 'approved':
      return 'check'
    case 'rejected':
      return 'xCircle'
    default:
      return 'infoCircle'
  }
}

function submissionStatusClass(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-orange-500/80 text-white'
    case 'approved':
      return 'bg-emerald-500/80 text-white'
    case 'rejected':
      return 'bg-red-500/80 text-white'
    default:
      return 'bg-gray-500/80 text-white'
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
</script>
