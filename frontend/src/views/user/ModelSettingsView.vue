<template>
  <AppLayout>
    <div class="mx-auto max-w-5xl space-y-6">
      <div v-if="loading" class="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>

      <template v-else>
        <div class="card">
          <div class="flex items-start justify-between border-b border-gray-100 px-6 py-4 dark:border-dark-700">
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                {{ t('modelSettings.title') }}
              </h2>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {{ t('modelSettings.description') }}
              </p>
            </div>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="modelsLoading"
              @click="loadModels"
            >
              {{ modelsLoading ? t('modelSettings.models.loading') : t('modelSettings.models.refresh') }}
            </button>
          </div>
          <div class="space-y-3 p-6">
            <div v-if="modelsLoading" class="flex items-center gap-2 text-gray-500">
              <div class="h-4 w-4 animate-spin rounded-full border-b-2 border-primary-600"></div>
              {{ t('modelSettings.models.loading') }}
            </div>
            <div v-else-if="modelsError" class="text-sm text-red-500">
              {{ modelsError }}
            </div>
            <div v-else-if="displayModels.length === 0" class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('modelSettings.models.empty') }}
            </div>
            <div v-else class="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>{{ t('modelSettings.models.hint') }}</span>
              <span class="font-medium text-gray-700 dark:text-gray-300">
                {{ t('modelSettings.models.count', { count: displayModels.length }) }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="displayModels.length > 0" class="space-y-6">
          <div>
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
                {{ t('modelSettings.groups.image') }}
              </h3>
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ t('modelSettings.models.count', { count: imageModels.length }) }}
              </span>
            </div>
            <div v-if="imageModels.length === 0" class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('modelSettings.groups.emptyImage') }}
            </div>
            <div v-else class="grid gap-6 lg:grid-cols-2">
              <div
                v-for="model in imageModels"
                :key="model.id"
                class="card p-6"
              >
                <div class="flex items-start justify-between">
                  <div>
                    <h3 class="text-base font-semibold text-gray-900 dark:text-white">
                      {{ resolveModelLabel(model) }}
                    </h3>
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ model.id }}</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span v-if="!model.available" class="badge badge-warning">
                      {{ t('modelSettings.models.unavailable') }}
                    </span>
                    <button
                      v-if="!model.available"
                      type="button"
                      class="btn btn-danger btn-sm"
                      :disabled="saving"
                      @click="requestRemoveModel(model)"
                    >
                      <Icon name="trash" size="sm" />
                      {{ t('modelSettings.models.remove') }}
                    </button>
                  </div>
                </div>

                <div class="mt-5 space-y-4">
                  <div>
                    <div class="mb-2 flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300">
                      <span>{{ t('modelSettings.sections.modelType') }}</span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="option in modelTypeOptions"
                        :key="option.value"
                        type="button"
                        class="badge"
                        :class="getModelType(model.id) === option.value ? 'badge-primary' : 'badge-gray'"
                        @click="setModelType(model.id, option.value)"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div class="mb-2 flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300">
                      <span>{{ t('modelSettings.sections.displayName') }}</span>
                    </div>
                    <input
                      type="text"
                      class="input"
                      :placeholder="t('modelSettings.displayNamePlaceholder')"
                      :value="getDisplayName(model.id)"
                      @input="setDisplayName(model.id, ($event.target as HTMLInputElement).value)"
                    />
                    <p class="input-hint">{{ t('modelSettings.displayNameHint') }}</p>
                  </div>

                  <div>
                    <div class="mb-2 flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300">
                      <span>{{ t('modelSettings.sections.requestEndpoint') }}</span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="option in requestEndpointOptions"
                        :key="option.value"
                        type="button"
                        class="badge"
                        :class="getRequestEndpoint(model.id) === option.value ? 'badge-primary' : 'badge-gray'"
                        @click="setRequestEndpoint(model.id, option.value)"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div class="mb-2 flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300">
                      <span>{{ t('modelSettings.sections.resolutions') }}</span>
                      <span class="text-xs text-gray-500 dark:text-gray-400">
                        {{ t('modelSettings.selectedCount', { count: getSelectedCount(model.id, 'resolutions') }) }}
                      </span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="option in resolutionOptions"
                        :key="option"
                        type="button"
                        class="badge"
                        :class="isSelected(model.id, 'resolutions', option) ? 'badge-primary' : 'badge-gray'"
                        @click="toggleOption(model.id, 'resolutions', option)"
                      >
                        {{ option }}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div class="mb-2 flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300">
                      <span>{{ t('modelSettings.sections.aspectRatios') }}</span>
                      <span class="text-xs text-gray-500 dark:text-gray-400">
                        {{ t('modelSettings.selectedCount', { count: getSelectedCount(model.id, 'aspect_ratios') }) }}
                      </span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="option in aspectRatioOptions"
                        :key="option.value"
                        type="button"
                        class="badge"
                        :class="isSelected(model.id, 'aspect_ratios', option.value) ? 'badge-primary' : 'badge-gray'"
                        @click="toggleOption(model.id, 'aspect_ratios', option.value)"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
                {{ t('modelSettings.groups.video') }}
              </h3>
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ t('modelSettings.models.count', { count: videoModels.length }) }}
              </span>
            </div>
            <div v-if="videoModels.length === 0" class="text-sm text-gray-500 dark:text-gray-400">
              {{ t('modelSettings.groups.emptyVideo') }}
            </div>
            <div v-else class="grid gap-6 lg:grid-cols-2">
              <div
                v-for="model in videoModels"
                :key="model.id"
                class="card p-6"
              >
                <div class="flex items-start justify-between">
                  <div>
                    <h3 class="text-base font-semibold text-gray-900 dark:text-white">
                      {{ resolveModelLabel(model) }}
                    </h3>
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">{{ model.id }}</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span v-if="!model.available" class="badge badge-warning">
                      {{ t('modelSettings.models.unavailable') }}
                    </span>
                    <button
                      v-if="!model.available"
                      type="button"
                      class="btn btn-danger btn-sm"
                      :disabled="saving"
                      @click="requestRemoveModel(model)"
                    >
                      <Icon name="trash" size="sm" />
                      {{ t('modelSettings.models.remove') }}
                    </button>
                  </div>
                </div>

                <div class="mt-5 space-y-4">
                  <div>
                    <div class="mb-2 flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300">
                      <span>{{ t('modelSettings.sections.modelType') }}</span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="option in modelTypeOptions"
                        :key="option.value"
                        type="button"
                        class="badge"
                        :class="getModelType(model.id) === option.value ? 'badge-primary' : 'badge-gray'"
                        @click="setModelType(model.id, option.value)"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div class="mb-2 flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300">
                      <span>{{ t('modelSettings.sections.displayName') }}</span>
                    </div>
                    <input
                      type="text"
                      class="input"
                      :placeholder="t('modelSettings.displayNamePlaceholder')"
                      :value="getDisplayName(model.id)"
                      @input="setDisplayName(model.id, ($event.target as HTMLInputElement).value)"
                    />
                    <p class="input-hint">{{ t('modelSettings.displayNameHint') }}</p>
                  </div>

                  <div>
                    <div class="mb-2 flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300">
                      <span>{{ t('modelSettings.sections.requestEndpoint') }}</span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="option in requestEndpointOptions"
                        :key="option.value"
                        type="button"
                        class="badge"
                        :class="getRequestEndpoint(model.id) === option.value ? 'badge-primary' : 'badge-gray'"
                        @click="setRequestEndpoint(model.id, option.value)"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div class="mb-2 flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300">
                      <span>{{ t('modelSettings.sections.resolutions') }}</span>
                      <span class="text-xs text-gray-500 dark:text-gray-400">
                        {{ t('modelSettings.selectedCount', { count: getSelectedCount(model.id, 'resolutions') }) }}
                      </span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="option in resolutionOptions"
                        :key="option"
                        type="button"
                        class="badge"
                        :class="isSelected(model.id, 'resolutions', option) ? 'badge-primary' : 'badge-gray'"
                        @click="toggleOption(model.id, 'resolutions', option)"
                      >
                        {{ option }}
                      </button>
                    </div>
                  </div>

                  <div>
                    <div class="mb-2 flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300">
                      <span>{{ t('modelSettings.sections.aspectRatios') }}</span>
                      <span class="text-xs text-gray-500 dark:text-gray-400">
                        {{ t('modelSettings.selectedCount', { count: getSelectedCount(model.id, 'aspect_ratios') }) }}
                      </span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="option in aspectRatioOptions"
                        :key="option.value"
                        type="button"
                        class="badge"
                        :class="isSelected(model.id, 'aspect_ratios', option.value) ? 'badge-primary' : 'badge-gray'"
                        @click="toggleOption(model.id, 'aspect_ratios', option.value)"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex justify-end">
          <button type="button" class="btn btn-primary" :disabled="saving" @click="saveSettings">
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
            {{ saving ? t('modelSettings.saving') : t('common.save') }}
          </button>
        </div>
      </template>
    </div>

    <ConfirmDialog
      :show="showRemoveDialog"
      :title="t('modelSettings.models.removeConfirmTitle')"
      :message="t('modelSettings.models.removeConfirmMessage', { name: pendingRemoveLabel })"
      :confirm-text="t('common.delete')"
      :cancel-text="t('common.cancel')"
      :danger="true"
      @confirm="confirmRemoveModel"
      @cancel="cancelRemoveModel"
    />
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppLayout from '@/components/layout/AppLayout.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import { modelSettingsAPI } from '@/api'
import type { ModelType, NewAPIModel, RequestEndpoint, UserModelSetting } from '@/api/modelSettings'
import { useAppStore } from '@/stores'

type ModelSettingKey = 'resolutions' | 'aspect_ratios'

type DisplayModel = NewAPIModel & { available: boolean }

const { t } = useI18n()
const appStore = useAppStore()

const defaultRequestEndpoint: RequestEndpoint = 'openai'

const loading = ref(true)
const saving = ref(false)
const modelsLoading = ref(false)
const modelsError = ref('')
const models = ref<NewAPIModel[]>([])
const modelSettings = ref<Record<string, UserModelSetting>>({})
const showRemoveDialog = ref(false)
const pendingRemoveModel = ref<DisplayModel | null>(null)

const resolutionOptions = ['1K', '2K', '4K']
const aspectRatioOptions = [
  { value: 'Auto', label: 'Auto' },
  { value: '1:1', label: '1:1' },
  { value: '2:3', label: '2:3' },
  { value: '3:2', label: '3:2' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
  { value: '4:5', label: '4:5' },
  { value: '5:4', label: '5:4' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '21:9', label: '21:9' }
]
const modelTypeOptions = computed(() => [
  { value: 'image' as ModelType, label: t('modelSettings.modelTypes.image') },
  { value: 'video' as ModelType, label: t('modelSettings.modelTypes.video') }
])
const requestEndpointOptions = computed(() => [
  { value: 'openai' as RequestEndpoint, label: t('modelSettings.requestEndpoints.openai') },
  { value: 'gemini' as RequestEndpoint, label: t('modelSettings.requestEndpoints.gemini') },
  { value: 'openai_mod' as RequestEndpoint, label: t('modelSettings.requestEndpoints.openaiMod') }
])

const displayModels = computed<DisplayModel[]>(() => {
  const list: DisplayModel[] = models.value.map((model) => ({
    id: model.id,
    name: model.name || model.id,
    available: true
  }))
  const existing = new Set(list.map((item) => item.id))
  for (const modelId of Object.keys(modelSettings.value)) {
    if (!existing.has(modelId)) {
      list.push({ id: modelId, name: modelId, available: false })
    }
  }
  return list
})

const imageModels = computed(() =>
  displayModels.value.filter((model) => getModelType(model.id) === 'image')
)

const videoModels = computed(() =>
  displayModels.value.filter((model) => getModelType(model.id) === 'video')
)

const pendingRemoveLabel = computed(() => {
  if (!pendingRemoveModel.value) return ''
  return resolveModelLabel(pendingRemoveModel.value)
})

const ensureSetting = (modelId: string) => {
  if (!modelSettings.value[modelId]) {
    modelSettings.value[modelId] = {
      model_id: modelId,
      resolutions: [],
      aspect_ratios: [],
      model_type: undefined,
      display_name: ''
    }
  }
  return modelSettings.value[modelId]
}

const normalizeRequestEndpoint = (value?: string): RequestEndpoint | undefined => {
  if (value === 'openai' || value === 'gemini' || value === 'openai_mod') return value
  return undefined
}

const normalizeModelType = (value?: string): ModelType | undefined => {
  if (value === 'video') return 'video'
  if (value === 'image') return 'image'
  return undefined
}

const getModelType = (modelId: string): ModelType => {
  const setting = ensureSetting(modelId)
  return normalizeModelType(setting.model_type) ?? 'image'
}

const setModelType = (modelId: string, value: ModelType) => {
  const setting = ensureSetting(modelId)
  setting.model_type = value
}

const getDisplayName = (modelId: string): string => {
  const setting = ensureSetting(modelId)
  return setting.display_name?.trim() || ''
}

const setDisplayName = (modelId: string, value: string) => {
  const setting = ensureSetting(modelId)
  setting.display_name = value
}

const resolveModelLabel = (model: DisplayModel): string => {
  const custom = getDisplayName(model.id)
  if (custom) return custom
  return model.name || model.id
}

const getRequestEndpoint = (modelId: string): RequestEndpoint => {
  const setting = ensureSetting(modelId)
  return setting.request_endpoint ?? defaultRequestEndpoint
}

const setRequestEndpoint = (modelId: string, value: RequestEndpoint) => {
  const setting = ensureSetting(modelId)
  setting.request_endpoint = value
}

const isSelected = (modelId: string, key: ModelSettingKey, option: string): boolean => {
  const setting = ensureSetting(modelId)
  return setting[key].includes(option)
}

const toggleOption = (modelId: string, key: ModelSettingKey, option: string) => {
  const setting = ensureSetting(modelId)
  const list = setting[key]
  const index = list.indexOf(option)
  if (index >= 0) {
    list.splice(index, 1)
  } else {
    list.push(option)
  }
}

const getSelectedCount = (modelId: string, key: ModelSettingKey): number => {
  const setting = ensureSetting(modelId)
  return setting[key].length
}

const buildSettingsPayload = (settings: Record<string, UserModelSetting>) => {
  return Object.values(settings).filter(
    (item) =>
      item.resolutions.length > 0 ||
      item.aspect_ratios.length > 0 ||
      !!item.request_endpoint ||
      !!item.model_type ||
      !!item.display_name?.trim()
  )
}

const applySettingsResponse = (items: UserModelSetting[]) => {
  const next: Record<string, UserModelSetting> = {}
  for (const item of items || []) {
    if (!item.model_id) continue
    next[item.model_id] = {
      model_id: item.model_id,
      resolutions: [...(item.resolutions || [])],
      aspect_ratios: [...(item.aspect_ratios || [])],
      request_endpoint: normalizeRequestEndpoint(item.request_endpoint),
      model_type: normalizeModelType(item.model_type),
      display_name: item.display_name?.trim() || ''
    }
  }
  modelSettings.value = next
}

const loadSettings = async () => {
  try {
    const response = await modelSettingsAPI.getUserModelSettings()
    applySettingsResponse(response.items || [])
  } catch (error: any) {
    appStore.showError(
      t('modelSettings.loadFailed') + ': ' + (error.message || t('common.unknownError'))
    )
  }
}

const loadModels = async () => {
  modelsLoading.value = true
  modelsError.value = ''
  try {
    const result = await modelSettingsAPI.getUserNewAPIModels()
    models.value = result || []
    for (const model of models.value) {
      ensureSetting(model.id)
    }
  } catch (error: any) {
    models.value = []
    modelsError.value = error.message || t('modelSettings.models.loadFailed')
  } finally {
    modelsLoading.value = false
  }
}

const saveSettings = async () => {
  saving.value = true
  try {
    const response = await modelSettingsAPI.updateUserModelSettings({
      items: buildSettingsPayload(modelSettings.value)
    })
    applySettingsResponse(response.items || [])
    appStore.showSuccess(t('modelSettings.saveSuccess'))
  } catch (error: any) {
    appStore.showError(
      t('modelSettings.saveFailed') + ': ' + (error.message || t('common.unknownError'))
    )
  } finally {
    saving.value = false
  }
}

const requestRemoveModel = (model: DisplayModel) => {
  pendingRemoveModel.value = model
  showRemoveDialog.value = true
}

const cancelRemoveModel = () => {
  showRemoveDialog.value = false
  pendingRemoveModel.value = null
}

const confirmRemoveModel = async () => {
  if (!pendingRemoveModel.value || saving.value) return

  const modelId = pendingRemoveModel.value.id
  const next = { ...modelSettings.value }
  delete next[modelId]

  saving.value = true
  try {
    const response = await modelSettingsAPI.updateUserModelSettings({
      items: buildSettingsPayload(next)
    })
    applySettingsResponse(response.items || [])
    appStore.showSuccess(t('modelSettings.models.removeSuccess'))
    cancelRemoveModel()
  } catch (error: any) {
    appStore.showError(
      t('modelSettings.models.removeFailed') + ': ' + (error.message || t('common.unknownError'))
    )
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  await loadSettings()
  await loadModels()
  loading.value = false
})
</script>
