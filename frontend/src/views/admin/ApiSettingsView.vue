<template>
  <AppLayout>
    <div class="mx-auto max-w-4xl space-y-6">
      <div v-if="loading" class="flex items-center justify-center py-12">
        <div class="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600"></div>
      </div>

      <form v-else @submit.prevent="saveSettings" class="space-y-6">
        <div class="card">
          <div class="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ t('admin.apiSettings.title') }}
            </h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ t('admin.apiSettings.description') }}
            </p>
          </div>
          <div class="space-y-5 p-6">
            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ t('admin.apiSettings.form.baseUrlLabel') }}
              </label>
              <input v-model="form.base_url" type="text" class="input w-full" />
              <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {{ t('admin.apiSettings.form.baseUrlHint') }}
              </p>
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ t('admin.apiSettings.form.accessKeyLabel') }}
              </label>
              <input
                v-model="form.access_key"
                type="password"
                autocomplete="new-password"
                class="input w-full"
                :placeholder="
                  accessKeyConfigured
                    ? t('admin.apiSettings.form.accessKeyConfiguredHint')
                    : t('admin.apiSettings.form.accessKeyPlaceholder')
                "
              />
              <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {{ t('admin.apiSettings.form.accessKeyHint') }}
              </p>
            </div>

            <div>
              <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {{ t('admin.apiSettings.form.defaultModelLabel') }}
              </label>
              <input
                v-model="form.default_model"
                :list="models.length > 0 ? 'newapi-models' : undefined"
                type="text"
                class="input w-full"
                :placeholder="t('admin.apiSettings.form.defaultModelPlaceholder')"
              />
              <datalist v-if="models.length > 0" id="newapi-models">
                <option v-for="model in models" :key="model.id" :value="model.id">
                  {{ model.name }}
                </option>
              </datalist>
              <p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {{ t('admin.apiSettings.form.defaultModelHint') }}
              </p>
              <p
                v-if="defaultModelMissing"
                class="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400"
              >
                {{ t('admin.apiSettings.models.defaultMissing') }}
              </p>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-dark-700">
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ t('admin.apiSettings.models.title') }}
              </h2>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {{ t('admin.apiSettings.models.description') }}
              </p>
            </div>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="modelsLoading || !canFetchModels"
              @click="loadModels"
            >
              {{ modelsLoading ? t('admin.apiSettings.models.loading') : t('admin.apiSettings.models.refresh') }}
            </button>
          </div>
          <div class="p-6">
            <div v-if="modelsLoading" class="flex items-center gap-2 text-gray-500">
              <div class="h-4 w-4 animate-spin rounded-full border-b-2 border-primary-600"></div>
              {{ t('admin.apiSettings.models.loading') }}
            </div>

            <div v-else-if="modelsError" class="text-sm text-red-500">
              {{ modelsError }}
            </div>

            <div v-else-if="!canFetchModels" class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('admin.apiSettings.models.missingConfig') }}
            </div>

            <div v-else-if="models.length === 0" class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('admin.apiSettings.models.empty') }}
            </div>

            <div v-else class="flex flex-wrap gap-2">
              <span v-for="model in models" :key="model.id" class="badge badge-gray">
                {{ model.name || model.id }}
                <span v-if="model.name && model.name !== model.id" class="text-xs text-gray-500">
                  ({{ model.id }})
                </span>
              </span>
            </div>
          </div>
        </div>

        <div class="flex justify-end">
          <button type="submit" class="btn btn-primary" :disabled="saving">
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
            {{ saving ? t('admin.apiSettings.saving') : t('common.save') }}
          </button>
        </div>
      </form>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { adminAPI } from '@/api'
import type { NewAPIModel, NewAPISettings, UpdateNewAPISettingsRequest } from '@/api/admin/newapi'
import AppLayout from '@/components/layout/AppLayout.vue'
import { useAppStore } from '@/stores'

const { t } = useI18n()
const appStore = useAppStore()

const loading = ref(true)
const saving = ref(false)
const modelsLoading = ref(false)
const modelsError = ref('')
const models = ref<NewAPIModel[]>([])
const accessKeyConfigured = ref(false)

const form = reactive({
  base_url: '',
  access_key: '',
  default_model: ''
})

const canFetchModels = computed(() => {
  return accessKeyConfigured.value && form.base_url.trim().length > 0
})

const defaultModelMissing = computed(() => {
  if (!form.default_model || models.value.length === 0) return false
  return !models.value.some((model) => model.id === form.default_model)
})

async function loadSettings() {
  loading.value = true
  try {
    const settings: NewAPISettings = await adminAPI.newapi.getSettings()
    form.base_url = settings.base_url || ''
    form.default_model = settings.default_model || ''
    form.access_key = ''
    accessKeyConfigured.value = settings.access_key_configured
  } catch (error: any) {
    appStore.showError(
      t('admin.apiSettings.loadFailed') + ': ' + (error.message || t('common.unknownError'))
    )
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  saving.value = true
  try {
    const payload: UpdateNewAPISettingsRequest = {
      base_url: form.base_url,
      default_model: form.default_model
    }

    if (form.access_key.trim()) {
      payload.access_key = form.access_key.trim()
    }

    const updated = await adminAPI.newapi.updateSettings(payload)
    form.base_url = updated.base_url || ''
    form.default_model = updated.default_model || ''
    form.access_key = ''
    accessKeyConfigured.value = updated.access_key_configured
    appStore.showSuccess(t('admin.apiSettings.saveSuccess'))
    await loadModels()
  } catch (error: any) {
    appStore.showError(
      t('admin.apiSettings.saveFailed') + ': ' + (error.message || t('common.unknownError'))
    )
  } finally {
    saving.value = false
  }
}

async function loadModels() {
  if (!canFetchModels.value) {
    models.value = []
    modelsError.value = ''
    return
  }

  modelsLoading.value = true
  modelsError.value = ''
  try {
    const data = await adminAPI.newapi.getModels()
    models.value = data
  } catch (error: any) {
    models.value = []
    modelsError.value = t('admin.apiSettings.models.loadFailed')
  } finally {
    modelsLoading.value = false
  }
}

onMounted(async () => {
  await loadSettings()
  await loadModels()
})
</script>
