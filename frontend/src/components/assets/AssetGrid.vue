<template>
  <div class="space-y-6">
    <div v-for="group in groupedItems" :key="group.date" class="space-y-3">
      <!-- Date Divider -->
      <div class="flex items-center gap-3">
        <time class="text-sm font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
          {{ group.label }}
        </time>
        <div class="h-px flex-1 bg-gradient-to-r from-gray-300 to-transparent dark:from-dark-600"></div>
      </div>

      <!-- Asset Grid -->
      <div class="asset-grid grid gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        <article
          v-for="item in group.items"
          :key="`${item.type}-${item.id}`"
          class="asset-card group overflow-hidden rounded-xl border border-gray-200/70 bg-white shadow-sm transition-all duration-300 hover:shadow-md dark:border-dark-700/70 dark:bg-dark-900/70"
          :class="{ 'ring-2 ring-primary-500': isSelected(item) }"
        >
          <!-- Thumbnail -->
          <button
            type="button"
            class="relative w-full aspect-square overflow-hidden bg-gray-100 dark:bg-dark-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
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
        <div class="absolute left-1.5 top-1.5">
          <span
            class="inline-flex items-center gap-0.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm"
          >
            <Icon :name="item.type === 'image' ? 'sparkles' : 'play'" size="xs" />
          </span>
        </div>

        <!-- Selection / Favorite Overlay -->
        <div class="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10 group-focus-within:bg-black/10">
          <!-- Batch Mode Checkbox -->
          <div v-if="isBatchMode" class="absolute left-1.5 bottom-1.5 z-10">
            <div
              class="h-5 w-5 rounded-full border-2 border-white bg-black/20 text-white transition-all flex items-center justify-center"
              :class="{ 'bg-primary-500 border-primary-500': isSelected(item) }"
            >
              <Icon v-if="isSelected(item)" name="check" size="xs" />
            </div>
          </div>

          <!-- Favorite Button -->
          <button
            v-if="!isBatchMode"
            type="button"
            class="absolute right-1.5 top-1.5 z-10 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 p-1 rounded-full bg-black/20 backdrop-blur-sm"
            :class="{ 'opacity-100': isFavorited(item) }"
            @click.stop="$emit('toggle-favorite', item)"
          >
            <Icon
              :name="isFavorited(item) ? 'heartFilled' : 'heart'"
              class="text-white drop-shadow-md"
              size="xs"
              :class="{ 'text-red-500': isFavorited(item) }"
            />
          </button>
        </div>

        <!-- Submission Status Badge -->
        <div v-if="item.submissionStatus" class="absolute right-1.5 bottom-1.5 pointer-events-none">
          <span
            class="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur-sm"
            :class="submissionStatusClass(item.submissionStatus)"
          >
            <Icon :name="submissionStatusIcon(item.submissionStatus)" size="xs" />
          </span>
        </div>
      </button>

      <!-- Actions -->
      <div class="p-2">
        <div class="flex items-center justify-end gap-1" v-if="!isBatchMode">
          <button
            type="button"
            class="studio-icon-button p-1"
            :title="t('assets.download')"
            @click.stop="$emit('download', item)"
          >
            <Icon name="download" size="xs" />
          </button>
          <button
            v-if="canSubmit(item)"
            type="button"
            class="studio-icon-button p-1"
            :title="t('assets.submitToInspiration')"
            @click.stop="$emit('submit', item)"
          >
            <Icon name="upload" size="xs" />
          </button>
          <button
            type="button"
            class="studio-icon-button p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
            :title="t('assets.delete')"
            @click.stop="$emit('delete', item)"
          >
            <Icon name="trash" size="xs" />
          </button>
        </div>
      </div>
    </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
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

interface GroupedAssets {
  date: string
  label: string
  items: Asset[]
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

// Group assets by date
const groupedItems = computed<GroupedAssets[]>(() => {
  const groups = new Map<string, Asset[]>()

  props.items.forEach(item => {
    const date = new Date(item.createdAt)
    const dateKey = date.toISOString().split('T')[0] // YYYY-MM-DD

    if (!groups.has(dateKey)) {
      groups.set(dateKey, [])
    }
    groups.get(dateKey)!.push(item)
  })

  // Convert to array and sort by date (newest first)
  return Array.from(groups.entries())
    .map(([dateKey, items]) => ({
      date: dateKey,
      label: formatDateLabel(dateKey),
      items
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
})

function formatDateLabel(dateKey: string): string {
  const date = new Date(dateKey)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

  if (itemDate.getTime() === today.getTime()) {
    return t('common.today')
  }
  if (itemDate.getTime() === yesterday.getTime()) {
    return t('common.yesterday')
  }

  // Format as "October 1" or "10月1日"
  const month = date.toLocaleDateString(undefined, { month: 'long' })
  const day = date.getDate()
  return `${month} ${day}`
}function getAssetKey(item: Asset) {
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
</script>
