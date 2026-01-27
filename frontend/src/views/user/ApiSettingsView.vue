<template>
  <AppLayout>
    <div class="mx-auto max-w-3xl space-y-6">
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600"></div>
      </div>

      <form v-else @submit.prevent="saveSettings" class="space-y-6">
        <div class="card">
          <div class="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ t('userApiSettings.title') }}
            </h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ t('userApiSettings.description') }}
            </p>
          </div>
          <div class="space-y-5 p-6">
            <div class="flex items-center justify-between">
              <div>
                <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {{ t('userApiSettings.status.label') }}
                </label>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {{ t('userApiSettings.status.hint') }}
                </p>
              </div>
              <span :class="['badge', statusBadgeClass]">
                {{ statusLabel }}
              </span>
            </div>

            <div>
              <label class="input-label">{{ t('userApiSettings.form.label') }}</label>
              <input
                v-model="customKey"
                type="password"
                class="input w-full font-mono"
                autocomplete="new-password"
                :placeholder="t('userApiSettings.form.placeholder')"
              />
              <p class="input-hint">
                {{
                  customKeyConfigured
                    ? t('userApiSettings.form.keepHint')
                    : t('userApiSettings.form.hint')
                }}
              </p>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3">
          <button
            v-if="customKeyConfigured"
            type="button"
            class="btn btn-danger btn-sm"
            :disabled="saving"
            @click="showClearConfirm = true"
          >
            {{ t('userApiSettings.clear') }}
          </button>
          <button type="submit" class="btn btn-primary" :disabled="saving || !canSave">
            <svg v-if="saving" class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            {{ saving ? t('userApiSettings.saving') : t('common.save') }}
          </button>
        </div>
      </form>
    </div>

    <ConfirmDialog
      :show="showClearConfirm"
      :title="t('userApiSettings.clearConfirmTitle')"
      :message="t('userApiSettings.clearConfirmMessage')"
      :confirm-text="t('userApiSettings.clearConfirmAction')"
      danger
      @confirm="clearSettings"
      @cancel="showClearConfirm = false"
    />
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { userApiSettingsAPI } from '@/api'
import { useAppStore } from '@/stores'

const { t } = useI18n()
const appStore = useAppStore()

const loading = ref(true)
const saving = ref(false)
const customKey = ref('')
const customKeyConfigured = ref(false)
const showClearConfirm = ref(false)

const statusLabel = computed(() =>
  customKeyConfigured.value
    ? t('userApiSettings.status.configured')
    : t('userApiSettings.status.notConfigured')
)

const statusBadgeClass = computed(() =>
  customKeyConfigured.value ? 'badge-success' : 'badge-gray'
)

const canSave = computed(() => customKey.value.trim().length > 0)

const loadSettings = async () => {
  loading.value = true
  try {
    const data = await userApiSettingsAPI.getUserApiSettings()
    customKeyConfigured.value = data.custom_key_configured
  } catch (error: any) {
    appStore.showError(
      t('userApiSettings.loadFailed') + ': ' + (error.message || t('common.unknownError'))
    )
  } finally {
    loading.value = false
  }
}

const saveSettings = async () => {
  if (!canSave.value) {
    return
  }
  saving.value = true
  try {
    const data = await userApiSettingsAPI.updateUserApiSettings(customKey.value.trim())
    customKeyConfigured.value = data.custom_key_configured
    customKey.value = ''
    appStore.showSuccess(t('userApiSettings.saveSuccess'))
  } catch (error: any) {
    appStore.showError(
      t('userApiSettings.saveFailed') + ': ' + (error.message || t('common.unknownError'))
    )
  } finally {
    saving.value = false
  }
}

const clearSettings = async () => {
  showClearConfirm.value = false
  saving.value = true
  try {
    const data = await userApiSettingsAPI.updateUserApiSettings('')
    customKeyConfigured.value = data.custom_key_configured
    customKey.value = ''
    appStore.showSuccess(t('userApiSettings.clearSuccess'))
  } catch (error: any) {
    appStore.showError(
      t('userApiSettings.saveFailed') + ': ' + (error.message || t('common.unknownError'))
    )
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadSettings()
})
</script>
