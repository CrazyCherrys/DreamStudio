<template>
  <AppLayout>
    <TablePageLayout>
      <template #filters>
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex flex-wrap items-center gap-3">
            <!-- Status Tabs -->
            <div class="flex rounded-lg bg-gray-100 p-1 dark:bg-dark-800">
              <button
                v-for="option in statusOptions"
                :key="option.value"
                @click="statusFilter = option.value as typeof statusFilter; handleStatusChange()"
                class="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
                :class="
                  statusFilter === option.value
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-dark-600 dark:text-white'
                    : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
                "
              >
                {{ option.label }}
              </button>
            </div>
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
        <!-- Loading State -->
        <div v-if="loading" class="flex justify-center py-12">
          <Icon name="refresh" class="h-8 w-8 animate-spin text-gray-400" />
        </div>

        <!-- Empty State -->
        <div v-else-if="submissions.length === 0" class="flex flex-col items-center justify-center py-12 text-gray-500">
          <p>{{ t('common.noData') }}</p>
        </div>

        <!-- Grid View -->
        <div v-else class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          <div
            v-for="item in submissions"
            :key="item.id"
            class="group relative aspect-square cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-gray-50 transition-all hover:shadow-lg dark:border-dark-700 dark:bg-dark-800"
            @click="openDetail(item)"
          >
            <img
              :src="item.thumbnail_url || item.image_url"
              :alt="promptText(item)"
              class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
            <div class="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100">
              <div class="flex items-center justify-between">
                <span :class="['badge badge-sm', statusClass(item.submission_status)]">
                  {{ statusLabel(item.submission_status) }}
                </span>
              </div>
            </div>
          </div>
        </div>
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

    <!-- Detail Modal -->
    <BaseDialog
      :show="detailOpen"
      :title="t('admin.inspiration.detailTitle')"
      :close-on-click-outside="true"
      @close="closeDetail"
    >
      <div v-if="selectedItem" class="flex flex-col gap-6">
        <!-- Large Image Preview -->
        <div class="flex items-center justify-center overflow-hidden rounded-xl bg-gray-50 dark:bg-dark-900">
          <img
            :src="selectedItem.image_url"
            :alt="promptText(selectedItem)"
            class="max-h-[60vh] w-auto object-contain"
          />
        </div>

        <!-- Details -->
        <div class="space-y-4">
          <div>
            <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400">{{ t('admin.inspiration.columns.prompt') }}</h3>
            <p class="mt-1 text-base text-gray-900 dark:text-white">{{ promptText(selectedItem) }}</p>
          </div>

          <div class="flex flex-wrap gap-4">
            <div>
              <h3 class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ t('admin.inspiration.columns.status') }}</h3>
              <span :class="['badge mt-1', statusClass(selectedItem.submission_status)]">
                {{ statusLabel(selectedItem.submission_status) }}
              </span>
            </div>
            <div>
              <h3 class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ t('admin.inspiration.columns.submittedAt') }}</h3>
              <p class="mt-1 text-sm text-gray-900 dark:text-white">
                {{ formatRelativeTime(selectedItem.submitted_at || selectedItem.created_at) }}
              </p>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex justify-end gap-3 pt-2 border-t border-gray-100 dark:border-dark-700">
            <button type="button" class="btn btn-secondary" @click="closeDetail">{{ t('common.close') }}</button>
            <template v-if="selectedItem.submission_status === 'pending'">
              <button type="button" class="btn btn-danger" @click="requestReview(selectedItem, 'rejected')">
                {{ t('admin.inspiration.actions.reject') }}
              </button>
              <button type="button" class="btn btn-success" @click="requestReview(selectedItem, 'approved')">
                {{ t('admin.inspiration.actions.approve') }}
              </button>
            </template>
            <template v-else-if="selectedItem.submission_status === 'approved'">
              <button type="button" class="btn btn-warning" @click="requestReview(selectedItem, 'pending')">
                {{ t('admin.inspiration.actions.revoke') }}
              </button>
            </template>
          </div>
        </div>
      </div>
    </BaseDialog>

    <!-- Confirm Dialog -->
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
import AppLayout from '@/components/layout/AppLayout.vue'
import TablePageLayout from '@/components/layout/TablePageLayout.vue'
import Pagination from '@/components/common/Pagination.vue'
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

const statusOptions = computed(() => [
  { value: 'pending', label: t('admin.inspiration.status.pending') },
  { value: 'approved', label: t('admin.inspiration.status.approved') },
  { value: 'rejected', label: t('admin.inspiration.status.rejected') },
  { value: 'all', label: t('admin.inspiration.status.all') }
])

const detailOpen = ref(false)
const selectedItem = ref<GalleryImage | null>(null)

const reviewRequest = ref<{ image: GalleryImage; status: 'approved' | 'rejected' | 'pending' } | null>(null)

const reviewDialogTitle = computed(() => {
  switch (reviewRequest.value?.status) {
    case 'approved':
      return t('admin.inspiration.confirmApproveTitle')
    case 'rejected':
      return t('admin.inspiration.confirmRejectTitle')
    case 'pending':
      return t('admin.inspiration.confirmRevokeTitle')
    default:
      return ''
  }
})

const reviewDialogMessage = computed(() => {
  switch (reviewRequest.value?.status) {
    case 'approved':
      return t('admin.inspiration.confirmApproveMessage')
    case 'rejected':
      return t('admin.inspiration.confirmRejectMessage')
    case 'pending':
      return t('admin.inspiration.confirmRevokeMessage')
    default:
      return ''
  }
})

const reviewDialogConfirm = computed(() => {
  switch (reviewRequest.value?.status) {
    case 'approved':
      return t('admin.inspiration.actions.approve')
    case 'rejected':
      return t('admin.inspiration.actions.reject')
    case 'pending':
      return t('admin.inspiration.actions.revoke')
    default:
      return ''
  }
})

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

function openDetail(image: GalleryImage) {
  selectedItem.value = image
  detailOpen.value = true
}

function closeDetail() {
  detailOpen.value = false
  selectedItem.value = null
}

function requestReview(image: GalleryImage, status: 'approved' | 'rejected' | 'pending') {
  if (status === 'pending' && image.submission_status !== 'approved') return
  if (status !== 'pending' && image.submission_status !== 'pending') return
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
    const successMessage =
      status === 'approved'
        ? t('admin.inspiration.approveSuccess')
        : status === 'rejected'
          ? t('admin.inspiration.rejectSuccess')
          : t('admin.inspiration.revokeSuccess')
    appStore.showSuccess(successMessage)
    reviewRequest.value = null
    // Close detail modal and reload
    closeDetail()
    await loadSubmissions()
  } catch (err: any) {
    appStore.showError(err?.message || t('admin.inspiration.updateFailed'))
  }
}

onMounted(() => {
  loadSubmissions()
})
</script>
