<template>
  <AppLayout>
    <div class="mx-auto max-w-5xl space-y-6">
      <div v-if="loading" class="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>

      <template v-else>
        <div class="card">
          <div class="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
            <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ t('modelSettings.title') }}
            </h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {{ t('modelSettings.description') }}
            </p>
          </div>
          <div class="space-y-4 p-6">
            <div class="grid gap-4 md:grid-cols-3">
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {{ t('modelSettings.addModel.modelIdLabel') }}
                </label>
                <input
                  v-model="newModelId"
                  type="text"
                  class="input w-full"
                  :placeholder="t('modelSettings.addModel.modelIdPlaceholder')"
                />
              </div>
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {{ t('modelSettings.addModel.modelNameLabel') }}
                </label>
                <input
                  v-model="newModelName"
                  type="text"
                  class="input w-full"
                  :placeholder="t('modelSettings.addModel.modelNamePlaceholder')"
                />
              </div>
              <div>
                <label class="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {{ t('modelSettings.addModel.modelTypeLabel') }}
                </label>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="option in modelTypeOptions"
                    :key="option.value"
                    type="button"
                    class="badge"
                    :class="newModelType === option.value ? 'badge-primary' : 'badge-gray'"
                    @click="newModelType = option.value"
                  >
                    {{ option.label }}
                  </button>
                </div>
              </div>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3">
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ t('modelSettings.addModel.hint') }}
              </p>
              <button type="button" class="btn btn-primary btn-sm" :disabled="saving" @click="addModel">
                {{ t('modelSettings.addModel.action') }}
              </button>
            </div>

            <div v-if="addError" class="text-sm text-red-500">
              {{ addError }}
            </div>

            <div v-if="displayModels.length === 0" class="text-sm text-gray-500 dark:text-gray-400">
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
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
              {{ t('modelSettings.filters.title') }}
            </h3>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="option in modelFilterOptions"
                :key="option.value"
                type="button"
                class="badge"
                :class="modelFilter === option.value ? 'badge-primary' : 'badge-gray'"
                @click="modelFilter = option.value"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div
            v-for="group in filteredModelGroups"
            :key="group.type"
          >
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
                {{ group.label }}
              </h3>
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ t('modelSettings.models.count', { count: group.models.length }) }}
              </span>
            </div>
            <div v-if="group.models.length === 0" class="text-sm text-gray-500 dark:text-gray-400">
              {{ group.emptyLabel }}
            </div>
            <div v-else class="grid gap-6 lg:grid-cols-2">
              <div
                v-for="model in group.models"
                :key="model.id"
                class="card p-6"
              >
                <div class="flex items-start justify-between">
                  <div>
                    <h3 class="text-base font-semibold text-gray-900 dark:text-white">
                      {{ resolveModelLabel(model) }}
                    </h3>
                    <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {{ resolveRequestModelId(model.id) }}
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
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
                      <span>{{ t('modelSettings.sections.modelId') }}</span>
                    </div>
                    <input
                      type="text"
                      class="input"
                      :placeholder="t('modelSettings.modelIdPlaceholder', { id: model.id })"
                      :value="getRequestModelId(model.id)"
                      @input="setRequestModelId(model.id, ($event.target as HTMLInputElement).value)"
                    />
                    <p class="input-hint">{{ t('modelSettings.modelIdHint') }}</p>
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
                      <span>{{ t('modelSettings.sections.rpm') }}</span>
                      <label class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <input
                          type="checkbox"
                          class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          :checked="isRPMEnabled(model.id)"
                          @change="setRPMEnabled(model.id, ($event.target as HTMLInputElement).checked)"
                        />
                        {{ t('modelSettings.rpm.enable') }}
                      </label>
                    </div>
                    <input
                      type="number"
                      min="1"
                      class="input"
                      :disabled="!isRPMEnabled(model.id)"
                      :placeholder="t('modelSettings.rpm.placeholder')"
                      :value="getRPM(model.id)"
                      @input="setRPM(model.id, ($event.target as HTMLInputElement).value)"
                    />
                    <p class="input-hint">{{ t('modelSettings.rpm.hint') }}</p>
                  </div>

                  <div v-if="isImageModel(model.id) || isVideoModel(model.id)">
                    <div class="mb-2 flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300">
                      <span>{{ t('modelSettings.sections.resolutions') }}</span>
                      <span class="text-xs text-gray-500 dark:text-gray-400">
                        {{ t('modelSettings.selectedCount', { count: getSelectedCount(model.id, 'resolutions') }) }}
                      </span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="option in resolutionOptionsForModel(model.id)"
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

                  <div v-if="isImageModel(model.id)">
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

                  <div v-if="isVideoModel(model.id)">
                    <div class="mb-2 flex items-center justify-between text-sm font-medium text-gray-700 dark:text-gray-300">
                      <span>{{ t('modelSettings.sections.durations') }}</span>
                      <span class="text-xs text-gray-500 dark:text-gray-400">
                        {{ t('modelSettings.selectedCount', { count: getSelectedCount(model.id, 'durations') }) }}
                      </span>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-for="option in videoDurationOptions"
                        :key="option.value"
                        type="button"
                        class="badge"
                        :class="isSelected(model.id, 'durations', option.value) ? 'badge-primary' : 'badge-gray'"
                        @click="toggleOption(model.id, 'durations', option.value)"
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
import type { ModelType, RequestEndpoint, UserModelSetting } from '@/api/modelSettings'
import { useAppStore } from '@/stores'

type ModelSettingKey = 'resolutions' | 'aspect_ratios' | 'durations'
type ModelFilter = 'all' | ModelType

type ModelGroup = {
  type: ModelType
  label: string
  emptyLabel: string
  models: DisplayModel[]
}

type DisplayModel = { id: string; name: string }

const { t } = useI18n()
const appStore = useAppStore()

const defaultRequestEndpoint: RequestEndpoint = 'openai'

const loading = ref(true)
const saving = ref(false)
const modelSettings = ref<Record<string, UserModelSetting>>({})
const showRemoveDialog = ref(false)
const pendingRemoveModel = ref<DisplayModel | null>(null)
const newModelId = ref('')
const newModelName = ref('')
const newModelType = ref<ModelType>('image')
const addError = ref('')

const resolutionOptions = ['1K', '2K', '4K']
const videoResolutionOptions = ['480p', '720p', '1080p', '4K']
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
const videoDurationOptions = [
  { value: '2', label: '2s' },
  { value: '4', label: '4s' },
  { value: '6', label: '6s' },
  { value: '8', label: '8s' },
  { value: '10', label: '10s' }
]
const modelTypeOptions = computed(() => [
  { value: 'image' as ModelType, label: t('modelSettings.modelTypes.image') },
  { value: 'video' as ModelType, label: t('modelSettings.modelTypes.video') },
  { value: 'text' as ModelType, label: t('modelSettings.modelTypes.text') }
])
const requestEndpointOptions = computed(() => [
  { value: 'openai' as RequestEndpoint, label: t('modelSettings.requestEndpoints.openai') },
  { value: 'gemini' as RequestEndpoint, label: t('modelSettings.requestEndpoints.gemini') },
  { value: 'openai_mod' as RequestEndpoint, label: t('modelSettings.requestEndpoints.openaiMod') }
])
const modelFilter = ref<ModelFilter>('all')
const modelFilterOptions = computed(() => [
  { value: 'all' as ModelFilter, label: t('modelSettings.filters.all') },
  { value: 'image' as ModelFilter, label: t('modelSettings.modelTypes.image') },
  { value: 'video' as ModelFilter, label: t('modelSettings.modelTypes.video') },
  { value: 'text' as ModelFilter, label: t('modelSettings.modelTypes.text') }
])

const displayModels = computed<DisplayModel[]>(() =>
  Object.values(modelSettings.value)
    .filter((setting) => setting.model_id)
    .map((setting) => ({
      id: setting.model_id,
      name: setting.display_name?.trim() || setting.model_id
    }))
)

const modelsByType = computed(() => {
  const grouped: Record<ModelType, DisplayModel[]> = {
    image: [],
    video: [],
    text: []
  }
  for (const model of displayModels.value) {
    const type = getModelType(model.id)
    if (type === 'video') {
      grouped.video.push(model)
    } else if (type === 'text') {
      grouped.text.push(model)
    } else {
      grouped.image.push(model)
    }
  }
  return grouped
})

const modelGroups = computed<ModelGroup[]>(() => [
  {
    type: 'image',
    label: t('modelSettings.groups.image'),
    emptyLabel: t('modelSettings.groups.emptyImage'),
    models: modelsByType.value.image
  },
  {
    type: 'video',
    label: t('modelSettings.groups.video'),
    emptyLabel: t('modelSettings.groups.emptyVideo'),
    models: modelsByType.value.video
  },
  {
    type: 'text',
    label: t('modelSettings.groups.text'),
    emptyLabel: t('modelSettings.groups.emptyText'),
    models: modelsByType.value.text
  }
])

const filteredModelGroups = computed(() =>
  modelFilter.value === 'all'
    ? modelGroups.value
    : modelGroups.value.filter((group) => group.type === modelFilter.value)
)

const pendingRemoveLabel = computed(() => {
  if (!pendingRemoveModel.value) return ''
  return resolveModelLabel(pendingRemoveModel.value)
})

const resetAddForm = () => {
  newModelId.value = ''
  newModelName.value = ''
  newModelType.value = 'image'
  addError.value = ''
}

const addModel = () => {
  const modelId = newModelId.value.trim()
  if (!modelId) {
    addError.value = t('modelSettings.addModel.errors.idRequired')
    return
  }
  if (modelSettings.value[modelId]) {
    addError.value = t('modelSettings.addModel.errors.duplicate')
    return
  }
  addError.value = ''
  modelSettings.value[modelId] = {
    model_id: modelId,
    request_model_id: modelId,
    resolutions: [],
    aspect_ratios: [],
    durations: [],
    model_type: newModelType.value,
    display_name: newModelName.value.trim(),
    rpm: 0,
    rpm_enabled: false
  }
  resetAddForm()
}

const ensureSetting = (modelId: string) => {
  if (!modelSettings.value[modelId]) {
    modelSettings.value[modelId] = {
      model_id: modelId,
      request_model_id: '',
      resolutions: [],
      aspect_ratios: [],
      durations: [],
      model_type: undefined,
      display_name: '',
      rpm: 0,
      rpm_enabled: false
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
  if (value === 'text') return 'text'
  if (value === 'image') return 'image'
  return undefined
}

const getModelType = (modelId: string): ModelType => {
  const setting = ensureSetting(modelId)
  return normalizeModelType(setting.model_type) ?? 'image'
}

const isImageModel = (modelId: string): boolean => getModelType(modelId) === 'image'
const isVideoModel = (modelId: string): boolean => getModelType(modelId) === 'video'

const resolutionOptionsForModel = (modelId: string): string[] => {
  if (isVideoModel(modelId)) return videoResolutionOptions
  return resolutionOptions
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

const getRequestModelId = (modelId: string): string => {
  const setting = ensureSetting(modelId)
  return setting.request_model_id?.trim() || ''
}

const setRequestModelId = (modelId: string, value: string) => {
  const setting = ensureSetting(modelId)
  setting.request_model_id = value
}

const resolveRequestModelId = (modelId: string): string => {
  const custom = getRequestModelId(modelId)
  return custom || modelId
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

const isRPMEnabled = (modelId: string): boolean => {
  const setting = ensureSetting(modelId)
  return !!setting.rpm_enabled
}

const setRPMEnabled = (modelId: string, value: boolean) => {
  const setting = ensureSetting(modelId)
  setting.rpm_enabled = value
  if (value && (!setting.rpm || setting.rpm <= 0)) {
    setting.rpm = 60
  }
}

const getRPM = (modelId: string): number => {
  const setting = ensureSetting(modelId)
  const rpmValue = Number(setting.rpm)
  if (!Number.isFinite(rpmValue) || rpmValue <= 0) {
    return 0
  }
  return Math.floor(rpmValue)
}

const setRPM = (modelId: string, value: string) => {
  const setting = ensureSetting(modelId)
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    setting.rpm = 0
    return
  }
  setting.rpm = Math.floor(parsed)
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
  return Object.values(settings).filter((item) => !!item.model_id?.trim())
}

const applySettingsResponse = (items: UserModelSetting[]) => {
  const next: Record<string, UserModelSetting> = {}
  for (const item of items || []) {
    if (!item.model_id) continue
    next[item.model_id] = {
      model_id: item.model_id,
      request_model_id: item.request_model_id?.trim() || '',
      resolutions: [...(item.resolutions || [])],
      aspect_ratios: [...(item.aspect_ratios || [])],
      durations: [...(item.durations || [])],
      request_endpoint: normalizeRequestEndpoint(item.request_endpoint),
      model_type: normalizeModelType(item.model_type),
      display_name: item.display_name?.trim() || '',
      rpm: Math.max(0, Number(item.rpm) || 0),
      rpm_enabled: !!item.rpm_enabled
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
  loading.value = false
})
</script>
