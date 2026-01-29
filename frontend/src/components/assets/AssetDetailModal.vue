<template>
  <BaseDialog
    :show="show"
    :title="t('assets.details')"
    width="wide"
    @close="$emit('close')"
  >
    <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
      <!-- Asset Preview -->
      <div class="flex items-center justify-center rounded-xl bg-gray-100 p-4 dark:bg-dark-800">
        <img
          v-if="asset.type === 'image'"
          :src="asset.url"
          :alt="asset.prompt"
          class="max-h-[60vh] max-w-full rounded-lg object-contain shadow-lg"
        />
        <video
          v-else
          :src="asset.url"
          controls
          class="max-h-[60vh] max-w-full rounded-lg shadow-lg"
        ></video>
      </div>

      <!-- Metadata -->
      <div class="space-y-6 overflow-y-auto max-h-[60vh] pr-2">
        <!-- Prompt -->
        <div>
          <h3 class="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
            {{ t('assets.prompt') }}
          </h3>
          <div class="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-dark-800 dark:text-gray-300">
            {{ asset.prompt || t('common.none') }}
          </div>
        </div>

        <!-- Details -->
        <div class="grid grid-cols-2 gap-4">
          <div v-if="asset.createdAt">
            <label class="text-xs text-gray-500">{{ t('assets.createdAt') }}</label>
            <p class="text-sm font-medium dark:text-gray-200">
              {{ new Date(asset.createdAt).toLocaleString() }}
            </p>
          </div>
          <div v-if="asset.id">
            <label class="text-xs text-gray-500">ID</label>
            <p class="text-sm font-medium dark:text-gray-200">{{ asset.id }}</p>
          </div>
          <div>
            <label class="text-xs text-gray-500">{{ t('common.type') }}</label>
            <p class="text-sm font-medium uppercase dark:text-gray-200">{{ asset.type }}</p>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-3 pt-4">
          <button
            type="button"
            class="btn btn-secondary flex-1"
            @click="$emit('download', asset)"
          >
            <Icon name="download" size="sm" />
            {{ t('assets.download') }}
          </button>
          <button
            v-if="asset.type === 'image'"
            type="button"
            class="btn btn-primary flex-1"
            @click="$emit('submit', asset)"
          >
            <Icon name="upload" size="sm" />
            {{ t('assets.submitToInspiration') }}
          </button>
        </div>
      </div>
    </div>
  </BaseDialog>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Icon from '@/components/icons/Icon.vue'

const { t } = useI18n()

interface Asset {
  id: number
  type: 'image' | 'video'
  url: string
  prompt?: string
  createdAt: string
  [key: string]: any
}

defineProps<{
  show: boolean
  asset: Asset
}>()

defineEmits<{
  close: []
  download: [asset: Asset]
  submit: [asset: Asset]
}>()
</script>
