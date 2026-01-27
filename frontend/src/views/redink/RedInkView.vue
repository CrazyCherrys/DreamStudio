<template>
  <AppLayout>
    <div class="space-y-6">
      <div class="flex flex-wrap items-center gap-3">
        <div>
          <h1 class="text-2xl font-semibold text-gray-900 dark:text-white">
            {{ t('redink.title') }}
          </h1>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {{ t('redink.subtitle') }}
          </p>
        </div>
      </div>

      <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section class="space-y-6">
          <div class="flex justify-center">
            <div
              class="flex items-center gap-4 rounded-full border border-gray-200 bg-white/70 px-5 py-2 text-sm shadow-sm dark:border-dark-700 dark:bg-dark-900/70"
            >
              <button type="button" class="flex items-center gap-2" @click="goToStep(1)">
                <span
                  class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
                  :class="
                    currentStep === 1
                      ? 'bg-primary-500 text-white'
                      : 'bg-emerald-500 text-white'
                  "
                >
                  <Icon v-if="currentStep === 2" name="check" size="xs" />
                  <span v-else>1</span>
                </span>
                <span
                  :class="
                    currentStep === 1
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-400 dark:text-dark-300'
                  "
                >
                  {{ t('redink.steps.input') }}
                </span>
              </button>
              <span class="h-px w-10 bg-gray-200 dark:bg-dark-700"></span>
              <button
                type="button"
                class="flex items-center gap-2"
                :class="canOpenPreview ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'"
                :disabled="!canOpenPreview"
                @click="goToStep(2)"
              >
                <span
                  class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
                  :class="
                    currentStep === 2
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-200 text-gray-500 dark:bg-dark-700 dark:text-dark-300'
                  "
                >
                  2
                </span>
                <span
                  :class="
                    currentStep === 2
                      ? 'text-gray-900 dark:text-white'
                      : 'text-gray-400 dark:text-dark-300'
                  "
                >
                  {{ t('redink.steps.preview') }}
                </span>
              </button>
            </div>
          </div>

          <div v-if="currentStep === 1" class="card">
            <div class="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
              <div class="flex items-center gap-3">
                <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/10 text-primary-500">
                  <Icon name="sparkles" size="sm" />
                </div>
                <div>
                  <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {{ t('redink.creator.title') }}
                  </h2>
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {{ t('redink.creator.description') }}
                  </p>
                </div>
              </div>
            </div>
            <div class="space-y-5 p-6">
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {{ t('redink.topic.label') }}
                </label>
                <textarea
                  v-model="topic"
                  class="input min-h-[120px] w-full resize-none"
                  :placeholder="t('redink.topic.placeholder')"
                  :maxlength="topicMaxLength"
                ></textarea>
                <div class="mt-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>{{ t('redink.topic.hint') }}</span>
                  <span>{{ topic.length }}/{{ topicMaxLength }}</span>
                </div>
              </div>

              <div class="grid gap-4 md:grid-cols-2">
                <div>
                  <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {{ t('redink.pageCount.label') }}
                  </label>
                  <Select v-model="pageCount" :options="pageCountOptions" />
                </div>
                <div>
                  <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {{ t('redink.settings.textModel') }}
                  </label>
                  <Select
                    v-model="textModelId"
                    :options="textModelOptions"
                    :placeholder="t('redink.settings.textModelPlaceholder')"
                    :disabled="modelsLoading"
                    searchable
                  />
                  <p v-if="modelsError" class="mt-1 text-xs text-red-500">
                    {{ modelsError }}
                  </p>
                </div>
              </div>

              <button
                type="button"
                class="btn btn-primary w-full"
                :disabled="generatingOutline"
                @click="handleGenerateOutline"
              >
                <Icon
                  :name="generatingOutline ? 'refresh' : 'sparkles'"
                  size="sm"
                  :class="generatingOutline ? 'animate-spin' : ''"
                />
                {{ generatingOutline ? t('redink.actions.generatingOutline') : t('redink.actions.generateOutline') }}
              </button>
              <p class="text-center text-xs text-gray-400 dark:text-gray-500">
                {{ t('redink.creator.hint') }}
              </p>
            </div>
          </div>

          <div v-else class="card">
            <div class="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {{ t('redink.preview.title') }}
                  </h2>
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {{ t('redink.preview.description') }}
                  </p>
                </div>
                <button type="button" class="btn btn-secondary btn-sm" @click="goToStep(1)">
                  <Icon name="arrowLeft" size="sm" />
                  {{ t('redink.actions.backToTopic') }}
                </button>
              </div>
            </div>
            <div class="space-y-4 p-6">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    :disabled="previewCards.length === 0"
                    @click="toggleSelectAll"
                  >
                    <Icon name="check" size="xs" />
                    {{ allPagesSelected ? t('redink.preview.clearSelection') : t('redink.preview.selectAll') }}
                  </button>
                  <span class="text-xs text-gray-500 dark:text-gray-400">
                    {{ t('redink.preview.selectedCount', { selected: selectedCount, total: previewCards.length }) }}
                  </span>
                </div>
                <div class="flex flex-wrap items-end gap-3">
                  <div class="min-w-[200px]">
                    <label class="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
                      {{ t('redink.settings.imageModel') }}
                    </label>
                    <Select
                      v-model="imageModelId"
                      :options="imageModelOptions"
                      :placeholder="t('redink.settings.imageModelPlaceholder')"
                      :disabled="modelsLoading || isRecordPreview"
                      searchable
                    />
                  </div>
                  <button
                    type="button"
                    class="btn btn-primary"
                    :disabled="generatingImages || selectedCount === 0"
                    @click="handleGenerateImages"
                  >
                    <Icon
                      :name="generatingImages ? 'refresh' : 'sparkles'"
                      size="sm"
                      :class="generatingImages ? 'animate-spin' : ''"
                    />
                    {{ generatingImages ? t('redink.preview.generating') : t('redink.preview.generate') }}
                  </button>
                </div>
              </div>

              <p v-if="previewCards.length === 0" class="text-sm text-gray-500 dark:text-gray-400">
                {{ t('redink.preview.empty') }}
              </p>
              <div v-else class="max-h-[calc(100vh-420px)] overflow-y-auto pr-1">
                <div :class="previewGridClass" :style="previewGridStyle">
                  <button
                    v-for="card in previewCards"
                    :key="card.uid"
                    type="button"
                    class="group relative flex h-64 flex-col rounded-2xl border border-gray-200 bg-white/70 p-4 text-left shadow-sm transition hover:border-primary-300 hover:shadow-md dark:border-dark-700 dark:bg-dark-900/60"
                    :class="[
                      previewUsesColumns ? 'mb-4' : '',
                      isPageSelected(card.uid)
                        ? 'border-primary-500 ring-2 ring-primary-200/40 dark:ring-primary-500/30'
                        : ''
                    ]"
                    :style="previewCardStyle"
                    @click="togglePageSelection(card.uid)"
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0 flex-1">
                        <h3 class="text-sm font-semibold text-gray-900 dark:text-white line-clamp-1">
                          {{ card.title }}
                        </h3>
                        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                          {{ card.subtitle }}
                        </p>
                      </div>
                      <div class="flex flex-col items-end gap-2">
                        <input
                          type="checkbox"
                          class="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          :checked="isPageSelected(card.uid)"
                          @click.stop
                          @change.stop="togglePageSelection(card.uid)"
                        />
                        <span
                          v-if="card.status"
                          class="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          :class="pageStatusClass(card.status)"
                        >
                          {{ pageStatusLabel(card.status) }}
                        </span>
                      </div>
                    </div>
                    <div class="mt-3 flex-1 overflow-hidden rounded-xl bg-gray-100/80 dark:bg-dark-800/60">
                      <img
                        v-if="card.imageUrl"
                        :src="card.imageUrl"
                        :alt="card.content"
                        class="h-full w-full object-cover"
                      />
                      <div v-else class="flex h-full w-full items-center justify-center text-gray-400">
                        <Icon name="grid" size="sm" />
                      </div>
                    </div>
                    <div class="mt-3 flex items-center justify-between text-xs">
                      <span class="font-semibold uppercase tracking-wide text-gray-400">
                        {{ pageTypeLabel(card.pageType) }}
                        ·
                        {{ t('redink.outline.pageLabel', { index: card.pageIndex + 1 }) }}
                      </span>
                      <span class="text-gray-500 dark:text-gray-400 line-clamp-1">
                        {{ card.caption }}
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div class="xl:border-l xl:border-gray-200/70 dark:border-dark-700/70 xl:pl-4">
          <aside class="flex min-h-0 flex-col space-y-5 xl:sticky xl:top-6 xl:h-[calc(100vh-64px-4rem)]">
            <div class="card flex min-h-0 flex-1 flex-col">
              <div class="px-6 pt-5">
                <div class="flex items-center justify-between gap-3">
                  <h2 class="text-base font-semibold text-gray-900 dark:text-white">
                    {{ t('redink.history.title') }}
                  </h2>
                  <button
                    type="button"
                    class="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white/70 text-gray-500 transition hover:border-primary-300 hover:text-primary-600 dark:border-dark-700 dark:bg-dark-900/70 dark:text-dark-300"
                    :disabled="recordsLoading || recordDetailLoading"
                    @click="handleSidebarRefresh"
                  >
                    <Icon
                      name="refresh"
                      size="sm"
                      :class="recordsLoading || recordDetailLoading ? 'animate-spin' : ''"
                    />
                    <span class="sr-only">{{ t('redink.actions.refresh') }}</span>
                  </button>
                </div>
              </div>
              <div class="flex-1 min-h-0 space-y-3 overflow-y-auto px-6 pb-6 pt-4">
                <div v-if="recordsLoading" class="flex items-center gap-2 text-xs text-gray-500 dark:text-dark-400">
                  <Icon name="refresh" size="sm" class="animate-spin" />
                  {{ t('common.loading') }}
                </div>
                <p v-if="!recordsLoading && !hasSidebarItems" class="text-xs text-gray-500 dark:text-dark-400">
                  {{ t('redink.history.empty') }}
                </p>
                <div v-if="hasSidebarItems" class="space-y-3">
                  <button
                    v-if="showOutlineCard"
                    type="button"
                    class="group flex w-full items-center gap-4 rounded-2xl border border-gray-200/70 bg-white/70 p-4 text-left shadow-sm transition dark:border-dark-700/70 dark:bg-dark-900/70"
                    :disabled="!outlineCardClickable"
                    :class="[
                      outlineCardSelected
                        ? 'border-primary-500 ring-1 ring-primary-200/40 dark:ring-primary-500/30'
                        : '',
                      outlineCardClickable
                        ? 'hover:border-primary-400/80 hover:shadow-md'
                        : 'cursor-not-allowed opacity-60'
                    ]"
                    @click="handleOutlineCardClick"
                  >
                    <div
                      class="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-gray-200/70 bg-gray-100/80 text-gray-400 dark:border-dark-700/70 dark:bg-dark-800/80 dark:text-dark-300"
                    >
                      <Icon name="document" size="sm" />
                    </div>
                    <div class="min-w-0 flex-1">
                      <h3 class="text-sm font-semibold text-gray-900 dark:text-white line-clamp-1">
                        {{ outlineCardTitle }}
                      </h3>
                      <p class="mt-1 text-xs text-gray-500 dark:text-dark-300">
                        {{ outlineCardMeta }}
                      </p>
                      <p v-if="outlineCardTime" class="mt-1 text-[11px] text-gray-400 dark:text-dark-400">
                        {{ outlineCardTime }}
                      </p>
                    </div>
                  </button>
                  <button
                    v-for="record in records"
                    :key="record.id"
                    type="button"
                    class="group flex w-full items-center gap-4 rounded-2xl border border-gray-200/70 bg-white/70 p-4 text-left shadow-sm transition dark:border-dark-700/70 dark:bg-dark-900/70"
                    :disabled="!isRecordClickable(record)"
                    :class="[
                      selectedRecordId === record.id
                        ? 'border-primary-500 ring-1 ring-primary-200/40 dark:ring-primary-500/30'
                        : '',
                      isRecordClickable(record)
                        ? 'hover:border-primary-400/80 hover:shadow-md'
                        : 'cursor-not-allowed opacity-60'
                    ]"
                    @click="handleRecordClick(record)"
                  >
                    <div
                      class="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-gray-200/70 bg-gray-100/80 text-gray-400 dark:border-dark-700/70 dark:bg-dark-800/80 dark:text-dark-300"
                    >
                      <img
                        v-if="record.thumbnail_url"
                        :src="record.thumbnail_url"
                        :alt="record.topic"
                        class="h-full w-full object-cover"
                      />
                      <div v-else class="flex h-full w-full items-center justify-center">
                        <Icon name="document" size="sm" />
                      </div>
                    </div>
                    <div class="min-w-0 flex-1">
                      <h3 class="text-sm font-semibold text-gray-900 dark:text-white line-clamp-1">
                        {{ record.topic || t('redink.history.untitled') }}
                      </h3>
                      <p class="mt-1 text-xs text-gray-500 dark:text-dark-300">
                        {{ recordProgressLabel(record) }} · {{ recordStatusLabel(record.status) }}
                      </p>
                      <p class="mt-1 text-[11px] text-gray-400 dark:text-dark-400">
                        {{ formatRelativeTime(record.created_at) }}
                      </p>
                    </div>
                  </button>
                  <button
                    v-if="hasMoreRecords"
                    type="button"
                    class="btn btn-secondary w-full"
                    :disabled="recordsLoading"
                    @click="loadMoreRecords"
                  >
                    {{ t('redink.history.loadMore') }}
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import Select from '@/components/common/Select.vue'
import Icon from '@/components/icons/Icon.vue'
import { useAppStore } from '@/stores'
import { redinkAPI, modelSettingsAPI } from '@/api'
import type { RedInkOutlinePage, RedInkPage, RedInkRecord, RedInkRecordDetail } from '@/types'
import type { NewAPIModel, UserModelSetting } from '@/api/modelSettings'
import { formatRelativeTime } from '@/utils/format'

type OutlinePageDraft = RedInkOutlinePage & { uid: string }
type PreviewSource = 'outline' | 'record'
type PreviewCard = {
  uid: string
  source: PreviewSource
  pageIndex: number
  pageType: string
  title: string
  subtitle: string
  caption: string
  content: string
  imageUrl?: string | null
  status?: RedInkPage['status']
  recordPageId?: number
}

const { t } = useI18n()
const appStore = useAppStore()

const topic = ref('')
const pages = ref<OutlinePageDraft[]>([])
const topicMaxLength = 500
const pageCount = ref<number | null>(null)
const currentStep = ref<1 | 2>(1)
const previewSource = ref<PreviewSource>('outline')

const selectedPageUids = ref<string[]>([])

const models = ref<NewAPIModel[]>([])
const modelSettings = ref<Record<string, UserModelSetting>>({})
const modelsLoading = ref(false)
const modelsError = ref('')

const textModelId = ref('')
const imageModelId = ref('')

const generatingOutline = ref(false)
const generatingImages = ref(false)
const outlineCreatedAt = ref<Date | null>(null)

const records = ref<RedInkRecord[]>([])
const recordsLoading = ref(false)
const recordsTotal = ref(0)
const recordsPage = ref(1)
const recordsPageSize = 8
const selectedRecordId = ref<number | null>(null)
const recordDetail = ref<RedInkRecordDetail | null>(null)
const recordDetailLoading = ref(false)

const maxPages = 12

const normalizeModelType = (value?: string) => {
  if (value === 'video') return 'video'
  if (value === 'text') return 'text'
  return 'image'
}

const resolveModelDisplayName = (model: NewAPIModel): string => {
  const custom = modelSettings.value[model.id]?.display_name?.trim()
  if (custom) return custom
  return model.name || model.id
}

const resolveRequestModelId = (modelId: string): string => {
  const custom = modelSettings.value[modelId]?.request_model_id?.trim()
  return custom || modelId
}

const textModelOptions = computed(() => {
  const typed = models.value.filter(
    (model) => normalizeModelType(modelSettings.value[model.id]?.model_type) === 'text'
  )
  const list = typed.length > 0 ? typed : models.value
  return list.map((model) => ({
    value: model.id,
    label: resolveModelDisplayName(model)
  }))
})

const imageModelOptions = computed(() => {
  const typed = models.value.filter(
    (model) => normalizeModelType(modelSettings.value[model.id]?.model_type) === 'image'
  )
  const list = typed.length > 0 ? typed : models.value
  return list.map((model) => ({
    value: model.id,
    label: resolveModelDisplayName(model)
  }))
})

const pageCountOptions = computed(() => {
  const options: Array<{ value: number | null; label: string }> = [
    { value: null, label: t('redink.pageCount.auto') }
  ]
  for (let count = 4; count <= maxPages; count += 1) {
    options.push({
      value: count,
      label: t('redink.pageCount.countLabel', { count })
    })
  }
  return options
})

const previewTopicLabel = computed(() => {
  if (previewSource.value === 'record') {
    const recordTopic = normalizeText(recordDetail.value?.topic || '')
    if (recordTopic) return recordTopic
  }
  const outlineTopic = normalizeText(topic.value)
  return outlineTopic || t('redink.history.untitled')
})

const previewCards = computed<PreviewCard[]>(() => {
  const caption = truncateText(previewTopicLabel.value, 16)
  if (previewSource.value === 'record') {
    if (!recordDetail.value) return []
    return recordDetail.value.pages.map((page) => {
      const copy = buildCardCopy(page.page_content)
      return {
        uid: `record-${page.id}`,
        source: 'record',
        pageIndex: page.page_index,
        pageType: page.page_type,
        title: copy.title,
        subtitle: copy.subtitle,
        caption,
        content: page.page_content,
        imageUrl: page.image_url,
        status: page.status,
        recordPageId: page.id
      }
    })
  }

  return pages.value.map((page, index) => {
    const copy = buildCardCopy(page.content)
    return {
      uid: page.uid,
      source: 'outline',
      pageIndex: page.index ?? index,
      pageType: page.type,
      title: copy.title,
      subtitle: copy.subtitle,
      caption,
      content: page.content,
      imageUrl: null
    }
  })
})

const previewUsesColumns = computed(() => previewCards.value.length > 10)

const previewGridClass = computed(() =>
  previewUsesColumns.value
    ? 'columns-1 sm:columns-2 lg:columns-3 xl:columns-5'
    : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
)

const previewGridStyle = computed(() => (previewUsesColumns.value ? { columnGap: '1rem' } : undefined))

const previewCardStyle = computed<CSSProperties | undefined>(() =>
  previewUsesColumns.value ? { breakInside: 'avoid', pageBreakInside: 'avoid' } : undefined
)

const selectedCards = computed(() =>
  previewCards.value.filter((card) => selectedPageUids.value.includes(card.uid))
)

const selectedOutlinePages = computed(() =>
  pages.value.filter((page) => selectedPageUids.value.includes(page.uid))
)

const selectedRecordPageIds = computed(() =>
  selectedCards.value
    .filter((card) => card.source === 'record' && card.recordPageId)
    .map((card) => card.recordPageId as number)
)

const selectedCount = computed(() => selectedCards.value.length)

const allPagesSelected = computed(
  () => previewCards.value.length > 0 && selectedCount.value === previewCards.value.length
)

const hasOutlinePages = computed(() => pages.value.length > 0)

const hasRecordPages = computed(() => (recordDetail.value?.pages?.length ?? 0) > 0)

const canOpenPreview = computed(() => hasOutlinePages.value || hasRecordPages.value)

const isRecordPreview = computed(() => previewSource.value === 'record' && !!recordDetail.value)

const hasMoreRecords = computed(() => records.value.length < recordsTotal.value)

const showOutlineCard = computed(() => generatingOutline.value || hasOutlinePages.value)

const outlineCardTitle = computed(() => {
  const outlineTopic = normalizeText(topic.value)
  return outlineTopic || t('redink.history.untitled')
})

const outlineCardMeta = computed(() => {
  if (generatingOutline.value) return t('redink.outlineCard.generating')
  if (hasOutlinePages.value) return t('redink.outlineCard.ready', { count: pages.value.length })
  return ''
})

const outlineCardTime = computed(() =>
  outlineCreatedAt.value ? formatRelativeTime(outlineCreatedAt.value) : ''
)

const outlineCardSelected = computed(() => previewSource.value === 'outline')

const outlineCardClickable = computed(() => hasOutlinePages.value && !generatingOutline.value)

const hasSidebarItems = computed(() => showOutlineCard.value || records.value.length > 0)

const shouldPollRecord = computed(() => {
  if (!recordDetail.value) return false
  if (recordDetail.value.status === 'generating') return true
  return recordDetail.value.pages.some((page) => page.status === 'pending' || page.status === 'running')
})

let recordPoller: ReturnType<typeof setInterval> | null = null
let recordFetchInFlight = false

const createUid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateText(value: string, limit: number) {
  if (value.length <= limit) return value
  if (limit <= 3) return value.slice(0, limit)
  return `${value.slice(0, limit - 3)}...`
}

function buildCardCopy(content: string) {
  const clean = normalizeText(content)
  if (!clean) {
    return { title: t('redink.history.untitled'), subtitle: '' }
  }
  const parts = clean
    .split(/[\n.!?;:]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  const titleSource = parts[0] || clean
  const subtitleSource = parts.length > 1 ? parts.slice(1).join(' ') : clean
  return {
    title: truncateText(titleSource, 18),
    subtitle: truncateText(subtitleSource, 60)
  }
}

watch(
  textModelOptions,
  (options) => {
    if (!textModelId.value && options.length > 0) {
      textModelId.value = String(options[0].value)
    }
  },
  { immediate: true }
)

watch(
  imageModelOptions,
  (options) => {
    if (!imageModelId.value && options.length > 0) {
      imageModelId.value = String(options[0].value)
    }
  },
  { immediate: true }
)

watch(shouldPollRecord, (value) => {
  if (value) {
    startRecordPolling()
    return
  }
  stopRecordPolling()
})

function goToStep(step: 1 | 2) {
  if (step === 2) {
    if (!canOpenPreview.value) return
    if (previewSource.value === 'record' && !hasRecordPages.value && hasOutlinePages.value) {
      previewSource.value = 'outline'
    }
    if (previewSource.value === 'outline' && !hasOutlinePages.value && hasRecordPages.value) {
      previewSource.value = 'record'
    }
  }
  currentStep.value = step
}

function selectAllPages() {
  selectedPageUids.value = previewCards.value.map((card) => card.uid)
}

function clearSelection() {
  selectedPageUids.value = []
}

function toggleSelectAll() {
  if (allPagesSelected.value) {
    clearSelection()
    return
  }
  selectAllPages()
}

function isPageSelected(uid: string) {
  return selectedPageUids.value.includes(uid)
}

function togglePageSelection(uid: string) {
  if (selectedPageUids.value.includes(uid)) {
    selectedPageUids.value = selectedPageUids.value.filter((id) => id !== uid)
    return
  }
  selectedPageUids.value = [...selectedPageUids.value, uid]
}

function buildOutlineFromPages(pagesInput: OutlinePageDraft[]): string {
  if (pagesInput.length === 0) return ''
  return pagesInput
    .map((page) => {
      const content = page.content.trim()
      const label = page.type || 'content'
      return `<page>\n[${label}]\n${content}`.trim()
    })
    .filter((value) => value.trim() !== '')
    .join('\n')
}

function buildPagesPayload(pagesInput: OutlinePageDraft[]): RedInkOutlinePage[] {
  return pagesInput
    .map((page, index) => ({
      index,
      type: page.type,
      content: page.content
    }))
    .filter((page) => page.content.trim() !== '')
}

async function handleGenerateOutline() {
  if (!topic.value.trim()) {
    appStore.showError(t('redink.topicRequired'))
    return
  }
  if (generatingOutline.value) return

  outlineCreatedAt.value = new Date()
  generatingOutline.value = true
  try {
    const payload = {
      topic: topic.value.trim(),
      model_id: textModelId.value ? resolveRequestModelId(textModelId.value) : undefined,
      page_count: pageCount.value ?? undefined
    }
    const result = await redinkAPI.generateOutline(payload)
    pages.value = result.pages.map((page) => ({ ...page, uid: createUid() }))
    clearSelection()
    previewSource.value = 'outline'
    currentStep.value = 2
    appStore.showSuccess(t('redink.outlineGenerated'))
  } catch (error: any) {
    appStore.showError(`${t('redink.outlineFailed')}: ${error.message || t('common.unknownError')}`)
  } finally {
    generatingOutline.value = false
  }
}

async function handleGenerateImages() {
  if (previewSource.value === 'record') {
    await handleGenerateRecordPages()
    return
  }
  if (!topic.value.trim()) {
    appStore.showError(t('redink.topicRequired'))
    return
  }
  if (pages.value.length === 0) {
    appStore.showError(t('redink.outlineRequired'))
    return
  }
  if (selectedOutlinePages.value.length === 0) {
    appStore.showError(t('redink.preview.selectionRequired'))
    return
  }
  if (generatingImages.value) return

  generatingImages.value = true
  const outline = buildOutlineFromPages(selectedOutlinePages.value)
  const payload = {
    topic: topic.value.trim(),
    outline_raw: outline,
    pages: buildPagesPayload(selectedOutlinePages.value),
    text_model_id: textModelId.value ? resolveRequestModelId(textModelId.value) : undefined,
    image_model_id: imageModelId.value ? resolveRequestModelId(imageModelId.value) : undefined
  }

  let created: RedInkRecordDetail
  try {
    created = await redinkAPI.createRecord(payload)
  } catch (error: any) {
    appStore.showError(`${t('redink.recordCreateFailed')}: ${error.message || t('common.unknownError')}`)
    generatingImages.value = false
    return
  }

  recordDetail.value = created
  selectedRecordId.value = created.id
  mergeRecordSummary(created)
  previewSource.value = 'record'
  clearSelection()

  try {
    const startPayload: { image_model_id?: string } = {}
    const requestModel = imageModelId.value ? resolveRequestModelId(imageModelId.value) : ''
    if (requestModel && requestModel !== created.image_model_id) {
      startPayload.image_model_id = requestModel
    }

    await redinkAPI.startGeneration(created.id, startPayload)
    appStore.showSuccess(t('redink.generationStarted'))
    await refreshSelectedRecord()
    await refreshRecords({ silent: true })
  } catch (error: any) {
    appStore.showError(`${t('redink.generationFailed')}: ${error.message || t('common.unknownError')}`)
  } finally {
    generatingImages.value = false
  }
}

async function handleGenerateRecordPages() {
  if (!recordDetail.value) {
    appStore.showError(t('redink.recordRequired'))
    return
  }
  if (selectedRecordPageIds.value.length === 0) {
    appStore.showError(t('redink.preview.selectionRequired'))
    return
  }
  if (generatingImages.value) return

  generatingImages.value = true
  try {
    await redinkAPI.retryPages(recordDetail.value.id, { page_ids: selectedRecordPageIds.value })
    appStore.showSuccess(t('redink.retryStarted'))
    clearSelection()
    await refreshSelectedRecord()
    await refreshRecords({ silent: true })
  } catch (error: any) {
    appStore.showError(`${t('redink.retryFailed')}: ${error.message || t('common.unknownError')}`)
  } finally {
    generatingImages.value = false
  }
}

async function loadModels() {
  modelsLoading.value = true
  modelsError.value = ''
  try {
    const [modelsResponse, settingsResponse] = await Promise.all([
      modelSettingsAPI.getUserNewAPIModels(),
      modelSettingsAPI.getUserModelSettings()
    ])
    models.value = modelsResponse

    const map: Record<string, UserModelSetting> = {}
    for (const item of settingsResponse.items || []) {
      map[item.model_id] = item
    }
    modelSettings.value = map
  } catch (error: any) {
    modelsError.value = error.message || t('common.unknownError')
  } finally {
    modelsLoading.value = false
  }
}

async function refreshRecords(options: { silent?: boolean } = {}) {
  await loadRecords({ page: 1, silent: options.silent })
}

async function loadRecords({ page = recordsPage.value, silent = false }: { page?: number; silent?: boolean } = {}) {
  if (!silent) {
    recordsLoading.value = true
  }
  try {
    const result = await redinkAPI.listRecords({
      page,
      page_size: recordsPageSize
    })
    recordsTotal.value = result.total
    recordsPage.value = result.page
    if (page === 1) {
      records.value = result.items
    } else {
      const existing = new Set(records.value.map((item) => item.id))
      const merged = [...records.value]
      for (const item of result.items) {
        if (!existing.has(item.id)) {
          merged.push(item)
        }
      }
      records.value = merged
    }
  } catch (error) {
    console.error('Failed to load records:', error)
  } finally {
    if (!silent) {
      recordsLoading.value = false
    }
  }
}

function loadMoreRecords() {
  if (recordsLoading.value || !hasMoreRecords.value) return
  loadRecords({ page: recordsPage.value + 1 })
}

function isRecordClickable(record: RedInkRecord) {
  return record.status !== 'generating'
}

function handleRecordClick(record: RedInkRecord) {
  if (!isRecordClickable(record)) return
  previewSource.value = 'record'
  clearSelection()
  currentStep.value = 2
  selectRecord(record.id)
}

function handleOutlineCardClick() {
  if (!outlineCardClickable.value) return
  previewSource.value = 'outline'
  clearSelection()
  goToStep(2)
}

async function selectRecord(recordId: number) {
  if (recordDetailLoading.value) return
  selectedRecordId.value = recordId
  await refreshSelectedRecord()
}

async function refreshSelectedRecord() {
  if (!selectedRecordId.value || recordFetchInFlight) return
  recordFetchInFlight = true
  recordDetailLoading.value = true
  try {
    const detail = await redinkAPI.getRecord(selectedRecordId.value)
    recordDetail.value = detail
    mergeRecordSummary(detail)
  } catch (error) {
    console.error('Failed to load record detail:', error)
  } finally {
    recordDetailLoading.value = false
    recordFetchInFlight = false
  }
}

async function handleSidebarRefresh() {
  await Promise.all([refreshRecords(), refreshSelectedRecord()])
}

function mergeRecordSummary(detail: RedInkRecordDetail) {
  const summary: RedInkRecord = {
    ...detail,
    total_pages: detail.pages?.length || detail.total_pages || 0,
    completed_pages: detail.pages?.filter((page) => page.status === 'succeeded').length || 0,
    failed_pages: detail.pages?.filter((page) => page.status === 'failed').length || 0
  }

  records.value = [summary, ...records.value.filter((record) => record.id !== detail.id)]
}

function startRecordPolling() {
  if (recordPoller) return
  recordPoller = setInterval(() => {
    refreshSelectedRecord()
    refreshRecords({ silent: true })
  }, 5000)
}

function stopRecordPolling() {
  if (!recordPoller) return
  clearInterval(recordPoller)
  recordPoller = null
}

function recordStatusLabel(status: string) {
  return t(`redink.record.status.${status}`)
}

function recordProgressLabel(record: RedInkRecord) {
  const completed = record.completed_pages ?? 0
  const total = record.total_pages ?? 0
  return t('redink.record.pageProgress', { completed, total })
}

function pageStatusLabel(status: string) {
  return t(`redink.page.status.${status}`)
}

function pageTypeLabel(type: string) {
  return t(`redink.page.types.${type}`)
}

function pageStatusClass(status: string) {
  switch (status) {
    case 'succeeded':
      return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
    case 'failed':
      return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
    case 'running':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    default:
      return 'bg-gray-100 text-gray-600 dark:bg-dark-800 dark:text-dark-200'
  }
}

onMounted(() => {
  loadModels()
  refreshRecords()
})

onBeforeUnmount(() => {
  stopRecordPolling()
})
</script>
