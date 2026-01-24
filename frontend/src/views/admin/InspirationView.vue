<template>
  <AppLayout>
    <TablePageLayout>
      <template #filters>
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex flex-wrap items-center gap-3">
            <Select
              v-model="statusFilter"
              :options="statusOptions"
              class="w-40"
              @change="handleStatusChange"
            />
            <span v-if="error" class="text-xs text-red-500">{{ error }}</span>
          </div>
          <button
            @click="loadSubmissions"
            :disabled="loading"
            class="btn btn-secondary"
            :title="t('common.refresh')"
          >
            <Icon name="refresh" size="md" :class="loading ? 'animate-spin' : ''" />
          </button>
        </div>
      </template>

      <template #table>
        <DataTable :columns="columns" :data="submissions" :loading="loading">
          <template #cell-preview="{ row }">
            <button
              type="button"
              class="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50 shadow-sm dark:border-dark-700 dark:bg-dark-800"
              @click="openPreview(row)"
            >
              <img
                :src="row.thumbnail_url || row.image_url"
                :alt="promptText(row)"
                class="h-full w-full object-cover"
              />
            </button>
          </template>

          <template #cell-prompt="{ row }">
            <p class="max-w-xs truncate text-sm text-gray-800 dark:text-gray-100">
              {{ promptText(row) }}
            </p>
          </template>

          <template #cell-status="{ row }">
            <span :class="['badge', statusClass(row.submission_status)]">
              {{ statusLabel(row.submission_status) }}
            </span>
          </template>

          <template #cell-submitted_at="{ row }">
            <span class="text-sm text-gray-500 dark:text-dark-400">
              {{ formatRelativeTime(row.submitted_at || row.created_at) }}
            </span>
          </template>

          <template #cell-actions="{ row }">
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="rounded-lg p-1.5 text-emerald-600 transition hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-900/20"
                :class="row.submission_status === 'pending' ? '' : 'pointer-events-none opacity-30'"
                :title="t('admin.inspiration.actions.approve')"
                @click="requestReview(row, 'approved')"
              >
                <Icon name="check" size="sm" />
              </button>
              <button
                type="button"
                class="rounded-lg p-1.5 text-red-500 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                :class="row.submission_status === 'pending' ? '' : 'pointer-events-none opacity-30'"
                :title="t('admin.inspiration.actions.reject')"
                @click="requestReview(row, 'rejected')"
              >
                <Icon name="x" size="sm" />
              </button>
            </div>
          </template>
        </DataTable>
      </template>

      <template #pagination>
        <Pagination
          v-if="pagination.total > 0"
          :page="pagination.page"
          :total="pagination.total"
          :page-size="pagination.page_size"
          @update:page="handlePageChange"
        />
      </template>
    </TablePageLayout>

    <BaseDialog
      :show="previewOpen"
      :title="t('admin.inspiration.previewTitle')"
      width="normal"
      @close="closePreview"
    >
      <div class="flex items-center justify-center">
        <img
          v-if="previewUrl"
          :src="previewUrl"
          :alt="previewAlt"
          class="max-h-[70vh] w-auto rounded-2xl object-contain shadow-card"
        />
      </div>
    </BaseDialog>

    <ConfirmDialog
      :show="Boolean(reviewRequest)"
      :title="reviewDialogTitle"
      :message="reviewDialogMessage"
      :confirm-text="reviewDialogConfirm"
      :danger="reviewRequest?.status === 'rejected'"
      @confirm="confirmReview"
      @cancel="cancelReview"
    />
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores'
import { listGallerySubmissions, updateGallerySubmissionStatus } from '@/api/admin/inspiration'
import type { GalleryImage } from '@/types'
import type { Column } from '@/components/common/types'
import AppLayout from '@/components/layout/AppLayout.vue'
import TablePageLayout from '@/components/layout/TablePageLayout.vue'
import DataTable from '@/components/common/DataTable.vue'
import Pagination from '@/components/common/Pagination.vue'
import Select from '@/components/common/Select.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import { formatRelativeTime } from '@/utils/format'

const { t } = useI18n()
const appStore = useAppStore()

const statusFilter = ref<'pending' | 'approved' | 'rejected' | 'all'>('pending')
const submissions = ref<GalleryImage[]>([])
const loading = ref(false)
const error = ref('')

const pagination = reactive({
  page: 1,
  page_size: 20,
  total: 0
})

const columns = computed<Column[]>(() => [
  { key: 'preview', label: t('admin.inspiration.columns.preview') },
  { key: 'prompt', label: t('admin.inspiration.columns.prompt') },
  { key: 'status', label: t('admin.inspiration.columns.status') },
  { key: 'submitted_at', label: t('admin.inspiration.columns.submittedAt') },
  { key: 'actions', label: t('admin.inspiration.columns.actions') }
])

const statusOptions = computed(() => [
  { value: 'pending', label: t('admin.inspiration.status.pending') },
  { value: 'approved', label: t('admin.inspiration.status.approved') },
  { value: 'rejected', label: t('admin.inspiration.status.rejected') },
  { value: 'all', label: t('admin.inspiration.status.all') }
])

const previewOpen = ref(false)
const previewUrl = ref('')
const previewAlt = ref('')

const reviewRequest = ref<{ image: GalleryImage; status: 'approved' | 'rejected' } | null>(null)

const reviewDialogTitle = computed(() =>
  reviewRequest.value?.status === 'approved'
    ? t('admin.inspiration.confirmApproveTitle')
    : t('admin.inspiration.confirmRejectTitle')
)

const reviewDialogMessage = computed(() =>
  reviewRequest.value?.status === 'approved'
    ? t('admin.inspiration.confirmApproveMessage')
    : t('admin.inspiration.confirmRejectMessage')
)

const reviewDialogConfirm = computed(() =>
  reviewRequest.value?.status === 'approved'
    ? t('admin.inspiration.actions.approve')
    : t('admin.inspiration.actions.reject')
)

const promptText = (image: GalleryImage): string => {
  return image.prompt?.trim() || t('gallery.promptFallback')
}

const statusLabel = (status: GalleryImage['submission_status']): string => {
  switch (status) {
    case 'approved':
      return t('admin.inspiration.status.approved')
    case 'rejected':
      return t('admin.inspiration.status.rejected')
    case 'pending':
      return t('admin.inspiration.status.pending')
    default:
      return t('admin.inspiration.status.none')
  }
}

const statusClass = (status: GalleryImage['submission_status']): string => {
  switch (status) {
    case 'approved':
      return 'badge-success'
    case 'rejected':
      return 'badge-danger'
    case 'pending':
      return 'badge-warning'
    default:
      return 'badge-gray'
  }
}

async function loadSubmissions() {
  loading.value = true
  error.value = ''
  try {
    const data = await listGallerySubmissions({
      page: pagination.page,
      page_size: pagination.page_size,
      status: statusFilter.value
    })
    submissions.value = data.items || []
    pagination.total = data.total || 0
  } catch (err: any) {
    submissions.value = []
    pagination.total = 0
    error.value = err?.message || t('admin.inspiration.loadFailed')
  } finally {
    loading.value = false
  }
}

function handleStatusChange() {
  pagination.page = 1
  loadSubmissions()
}

function handlePageChange(nextPage: number) {
  pagination.page = nextPage
  loadSubmissions()
}

function openPreview(image: GalleryImage) {
  previewUrl.value = image.image_url
  previewAlt.value = promptText(image)
  previewOpen.value = true
}

function closePreview() {
  previewOpen.value = false
  previewUrl.value = ''
  previewAlt.value = ''
}

function requestReview(image: GalleryImage, status: 'approved' | 'rejected') {
  if (image.submission_status !== 'pending') return
  reviewRequest.value = { image, status }
}

function cancelReview() {
  reviewRequest.value = null
}

async function confirmReview() {
  if (!reviewRequest.value) return
  const { image, status } = reviewRequest.value
  try {
    await updateGallerySubmissionStatus(image.id, status)
    appStore.showSuccess(
      status === 'approved'
        ? t('admin.inspiration.approveSuccess')
        : t('admin.inspiration.rejectSuccess')
    )
    reviewRequest.value = null
    await loadSubmissions()
  } catch (err: any) {
    appStore.showError(err?.message || t('admin.inspiration.updateFailed'))
  }
}

onMounted(() => {
  loadSubmissions()
})
</script>
