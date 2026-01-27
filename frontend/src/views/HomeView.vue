<template>
  <div v-if="showHomeContent" :class="homeContentClass">
    <iframe
      v-if="isHomeContentUrl"
      :src="homeContent.trim()"
      class="h-screen w-full border-0"
      allowfullscreen
    ></iframe>
    <div v-else v-html="homeContent"></div>
  </div>

  <div v-else :class="shellClass">
    <div v-if="showBackdrop" class="pointer-events-none absolute inset-0">
      <div
        class="absolute -right-40 -top-40 h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.25),transparent_70%)] blur-3xl"
      ></div>
      <div
        class="absolute -bottom-48 -left-48 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.22),transparent_70%)] blur-3xl"
      ></div>
      <div
        class="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.55),rgba(255,255,255,0.08))] dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.4),rgba(2,6,23,0.6))]"
      ></div>
      <div
        class="absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(15,23,42,0.08)_1px,transparent_1px)] [background-size:30px_30px] dark:[background-image:radial-gradient(rgba(148,163,184,0.12)_1px,transparent_1px)]"
      ></div>
    </div>

    <header v-if="showHeader" class="relative z-20 shrink-0 px-6 py-4">
      <nav class="flex w-full items-center justify-between">
        <router-link to="/home" class="flex items-center gap-3">
          <div class="h-10 w-10 overflow-hidden rounded-xl shadow-md">
            <img :src="siteLogo || '/logo.png'" alt="Logo" class="h-full w-full object-contain" />
          </div>
          <span class="hidden text-sm font-semibold text-gray-900 dark:text-white sm:inline">{{
            siteName
          }}</span>
        </router-link>

        <div class="flex items-center gap-3">
          <router-link to="/gallery" class="studio-pill">
            {{ t('gallery.nav.gallery') }}
          </router-link>

          <LocaleSwitcher />

          <a
            v-if="docUrl"
            :href="docUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-dark-400 dark:hover:bg-dark-800 dark:hover:text-white"
            :title="t('home.viewDocs')"
          >
            <Icon name="book" size="md" />
          </a>

          <button
            @click="toggleTheme"
            class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-dark-400 dark:hover:bg-dark-800 dark:hover:text-white"
            :title="isDark ? t('home.switchToLight') : t('home.switchToDark')"
          >
            <Icon v-if="isDark" name="sun" size="md" />
            <Icon v-else name="moon" size="md" />
          </button>

          <router-link
            v-if="isAuthenticated"
            :to="dashboardPath"
            class="inline-flex items-center gap-2 rounded-full bg-gray-900 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            <span
              class="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-[10px] font-semibold text-white"
            >
              {{ userInitial }}
            </span>
            {{ t('home.dashboard') }}
          </router-link>
          <router-link
            v-else
            to="/login"
            class="studio-pill bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
          >
            {{ t('home.login') }}
          </router-link>
        </div>
      </nav>
    </header>

    <main class="relative z-10 flex-1 px-6 pb-6 pt-4 lg:min-h-0 lg:overflow-hidden lg:pb-0 lg:pt-2">
      <div class="w-full max-w-none lg:h-full lg:overflow-hidden">
        <div
          class="grid gap-6 lg:h-full lg:min-h-0 lg:grid-cols-[420px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[480px_minmax(0,1fr)]"
        >
          <section class="space-y-6 lg:min-h-0 lg:h-full">
            <div
              ref="leftPanelRef"
              class="p-6 md:p-8 animate-slide-up lg:flex lg:h-full lg:min-h-0 lg:flex-col"
              :class="[
                isVideoMode ? 'lg:overflow-auto' : 'lg:overflow-hidden',
                panelCardClass,
                panelToneClassLeft
              ]"
            >
              <div
                ref="leftContentRef"
                class="flex min-h-full flex-col lg:origin-top-left lg:transition-transform"
                :style="scaleStyle"
              >
                <div v-if="showModeToggle || showModeBadge" class="flex flex-wrap items-center gap-2">
                  <template v-if="showModeToggle">
                    <button
                      type="button"
                      class="studio-tab"
                      :class="{ 'studio-tab-active': activeMode === 'image' }"
                      :aria-pressed="activeMode === 'image'"
                      @click="activeMode = 'image'"
                    >
                      <Icon name="sparkles" size="sm" />
                      {{ t('home.generator.modeImage') }}
                    </button>
                    <button
                      type="button"
                      class="studio-tab"
                      :class="{ 'studio-tab-active': activeMode === 'video' }"
                      :aria-pressed="activeMode === 'video'"
                      @click="activeMode = 'video'"
                    >
                      <Icon name="play" size="sm" />
                      {{ t('home.generator.modeVideo') }}
                    </button>
                  </template>
                  <div v-else class="studio-tab studio-tab-active cursor-default">
                    <Icon :name="isVideoMode ? 'play' : 'sparkles'" size="sm" />
                    {{ isVideoMode ? t('home.generator.modeVideo') : t('home.generator.modeImage') }}
                  </div>
                </div>

                <div class="mt-6 flex flex-col gap-5">
                <div>
                  <div class="mb-2 flex items-center justify-between">
                    <label class="text-sm font-semibold text-gray-800 dark:text-gray-200">
                      {{ t('home.generator.modelLabel') }}
                    </label>
                    <span v-if="modelsLoading" class="text-xs text-gray-500">{{
                      t('common.loading')
                    }}</span>
                  </div>
                  <Select
                    :model-value="selectedModel"
                    :options="modelOptions"
                    :placeholder="t('home.generator.modelPlaceholder')"
                    :disabled="!isAuthenticated || modelOptions.length === 0"
                    searchable
                    @update:modelValue="handleModelChange"
                  />
                  <div
                    class="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-dark-400"
                  >
                    <span v-if="modelsError">{{ modelsError }}</span>
                    <span v-else-if="!isAuthenticated">{{ t('home.generator.loginHint') }}</span>
                    <span v-else-if="modelOptions.length === 0">{{
                      t('home.generator.modelEmpty')
                    }}</span>
                  </div>
                </div>

                <div>
                  <div class="flex items-center justify-between">
                    <label
                      :for="promptInputId"
                      class="text-sm font-semibold text-gray-800 dark:text-gray-200"
                    >
                      {{ t('home.generator.promptLabel') }}
                    </label>
                    <button
                      type="button"
                      class="inline-flex items-center gap-1 rounded-lg border border-gray-200/70 px-2 py-1 text-xs font-semibold text-gray-600 transition hover:border-gray-300 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-700/60 dark:text-dark-300 dark:hover:text-gray-100"
                      :disabled="!canOptimizePrompt || optimizingPrompt"
                      @click="handleOptimizePrompt"
                    >
                      <Icon
                        :name="optimizingPrompt ? 'refresh' : 'sparkles'"
                        size="xs"
                        :class="optimizingPrompt ? 'animate-spin' : ''"
                      />
                      {{
                        optimizingPrompt
                          ? t('home.generator.optimizePrompting')
                          : t('home.generator.optimizePrompt')
                      }}
                    </button>
                  </div>
                  <div
                    class="mt-2 rounded-2xl border border-gray-200/70 bg-white/70 p-4 shadow-sm backdrop-blur-md dark:border-dark-700/70 dark:bg-dark-900/50 md:p-5"
                  >
                    <textarea
                      :id="promptInputId"
                      v-model="prompt"
                      :placeholder="t('home.generator.promptPlaceholder')"
                      :maxlength="promptLimit"
                      rows="6"
                      class="min-h-[180px] w-full resize-none bg-transparent text-sm leading-6 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:text-gray-100 dark:placeholder:text-dark-400"
                    ></textarea>
                    <div
                      class="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-dark-400"
                    >
                      <span>{{ promptCount }}/{{ promptLimit }}</span>
                      <button
                        v-if="prompt"
                        type="button"
                        class="rounded-lg p-1 text-gray-400 transition hover:text-gray-600 dark:text-dark-400 dark:hover:text-gray-200"
                        :title="t('home.generator.promptClear')"
                        :aria-label="t('home.generator.promptClear')"
                        @click="clearPrompt"
                      >
                        <Icon name="trash" size="sm" />
                      </button>
                    </div>
                    <div
                      class="mt-4 h-px w-full bg-gradient-to-r from-transparent via-gray-200/80 to-transparent dark:via-dark-700/80"
                    ></div>
                    <div
                      class="mt-4 flex items-center justify-between text-xs text-gray-500 dark:text-dark-400"
                    >
                      <span>{{ t('home.generator.imageLabel') }}</span>
                    </div>
                    <div class="mt-3 flex flex-wrap items-center gap-3">
                      <div
                        v-if="referencePreview"
                        class="group relative h-16 w-16 overflow-hidden rounded-xl border border-gray-200/70 bg-white/70 shadow-sm ring-1 ring-black/5 dark:border-dark-700 dark:bg-dark-900/60 dark:ring-white/5"
                      >
                        <img
                          :src="referencePreview"
                          :alt="t('home.generator.imageLabel')"
                          class="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          class="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                          :title="t('home.generator.imageRemove')"
                          :aria-label="t('home.generator.imageRemove')"
                          @click="clearImage"
                        >
                          <Icon name="x" size="xs" />
                        </button>
                      </div>
                      <button
                        type="button"
                        class="studio-upload flex h-16 w-16 items-center justify-center rounded-xl text-gray-500 transition hover:text-gray-700 dark:text-dark-400 dark:hover:text-gray-200"
                        :class="{ 'studio-upload-active': dropActive }"
                        :title="t('home.generator.imageUpload')"
                        :aria-label="t('home.generator.imageUpload')"
                        @click="openFilePicker"
                        @dragover.prevent="handleDragOver"
                        @dragleave="handleDragLeave"
                        @drop.prevent="handleDrop"
                      >
                        <Icon name="plus" size="md" />
                      </button>
                      <input
                        ref="fileInputRef"
                        type="file"
                        accept="image/*"
                        class="hidden"
                        @change="handleFileChange"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div class="mt-6 flex flex-col gap-4 lg:mt-auto">
                <div v-if="!isVideoMode" class="grid gap-4 md:grid-cols-2">
                  <div>
                    <div class="mb-2 flex items-center justify-between">
                      <label class="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {{ t('home.generator.ratioLabel') }}
                      </label>
                      <span v-if="availableRatios.length === 0" class="text-xs text-gray-500">{{
                        t('home.generator.ratioEmpty')
                      }}</span>
                    </div>
                    <Select
                      :model-value="selectedRatio"
                      :options="ratioOptions"
                      :placeholder="t('home.generator.ratioPlaceholder')"
                      :disabled="availableRatios.length === 0"
                      @update:modelValue="handleRatioChange"
                    />
                  </div>
                  <div>
                    <div class="mb-2 flex items-center justify-between">
                      <label class="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {{ t('home.generator.resolutionLabel') }}
                      </label>
                      <span
                        v-if="availableResolutions.length === 0"
                        class="text-xs text-gray-500"
                      >
                        {{ t('home.generator.resolutionEmpty') }}
                      </span>
                    </div>
                    <Select
                      :model-value="selectedResolution"
                      :options="resolutionOptions"
                      :placeholder="t('home.generator.resolutionPlaceholder')"
                      :disabled="availableResolutions.length === 0"
                      @update:modelValue="handleResolutionChange"
                    />
                  </div>
                  <div>
                    <label class="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">
                      {{ t('home.generator.imageCount') }}
                    </label>
                    <input
                      v-model.number="imageCount"
                      type="number"
                      min="1"
                      max="4"
                      step="1"
                      class="input"
                      :placeholder="t('home.generator.imageCountPlaceholder')"
                    />
                  </div>
                </div>
                <template v-else>
                  <div class="grid gap-4 md:grid-cols-2">
                    <div>
                      <label class="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {{ t('home.generator.videoDuration') }}
                      </label>
                      <input
                        v-model.number="videoDuration"
                        type="number"
                        min="1"
                        step="1"
                        class="input"
                        :placeholder="t('home.generator.videoDurationPlaceholder')"
                      />
                    </div>
                    <div>
                      <label class="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {{ t('home.generator.videoFps') }}
                      </label>
                      <input
                        v-model.number="videoFps"
                        type="number"
                        min="1"
                        step="1"
                        class="input"
                        :placeholder="t('home.generator.videoFpsPlaceholder')"
                      />
                    </div>
                  </div>
                  <div class="grid gap-4 md:grid-cols-2">
                    <div>
                      <label class="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {{ t('home.generator.videoWidth') }}
                      </label>
                      <input
                        v-model.number="videoWidth"
                        type="number"
                        min="1"
                        step="1"
                        class="input"
                        :placeholder="t('home.generator.videoWidthPlaceholder')"
                      />
                    </div>
                    <div>
                      <label class="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {{ t('home.generator.videoHeight') }}
                      </label>
                      <input
                        v-model.number="videoHeight"
                        type="number"
                        min="1"
                        step="1"
                        class="input"
                        :placeholder="t('home.generator.videoHeightPlaceholder')"
                      />
                    </div>
                  </div>
                  <div class="grid gap-4 md:grid-cols-2">
                    <div>
                      <label class="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {{ t('home.generator.videoSeed') }}
                      </label>
                      <input
                        v-model.number="videoSeed"
                        type="number"
                        min="0"
                        step="1"
                        class="input"
                        :placeholder="t('home.generator.videoSeedPlaceholder')"
                      />
                    </div>
                    <div>
                      <label class="mb-2 block text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {{ t('home.generator.videoCount') }}
                      </label>
                      <input
                        v-model.number="videoCount"
                        type="number"
                        min="1"
                        max="4"
                        step="1"
                        class="input"
                        :placeholder="t('home.generator.videoCountPlaceholder')"
                      />
                    </div>
                  </div>
                </template>

                <div
                  v-if="showModelSettingsHint"
                  class="rounded-2xl border border-orange-200/60 bg-orange-50/60 px-4 py-3 text-xs text-orange-700 dark:border-dark-700/60 dark:bg-dark-900/70 dark:text-orange-200"
                >
                  {{ t('home.generator.modelSettingsHint') }}
                </div>

                <button
                  type="button"
                  class="btn studio-generate w-full rounded-xl px-6 py-3 text-sm"
                  :disabled="!canGenerate || generating"
                  @click="handleGenerate"
                >
                  <Icon name="sparkles" size="sm" />
                  {{ generating ? t('home.generator.generating') : t('home.generator.generate') }}
                </button>

 
              </div>
            </div>
          </div>
          </section>

          <aside class="space-y-6 animate-slide-in-right lg:min-h-0 lg:h-full">
            <div
              class="p-4 lg:flex lg:h-full lg:min-h-0 lg:flex-col"
              :class="[panelCardClass, panelToneClassRight]"
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    class="studio-tab"
                    :class="{ 'studio-tab-active': activeTab === 'history' }"
                    @click="activeTab = 'history'"
                  >
                    <Icon name="clock" size="sm" />
                    {{ t('home.panel.history') }}
                  </button>
                  <button
                    type="button"
                    class="studio-tab"
                    :class="{ 'studio-tab-active': activeTab === 'creative' }"
                    @click="activeTab = 'creative'"
                  >
                    <Icon name="lightbulb" size="sm" />
                    {{ t('home.panel.creative') }}
                  </button>
                </div>
                <div
                  v-if="activeTab === 'history'"
                  class="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-dark-400"
                >
                  <div class="flex items-center gap-1">
                    <span>{{ t('home.history.filterStatus') }}</span>
                    <Select
                      class="w-24"
                      :model-value="historyStatusFilter"
                      :options="historyStatusOptions"
                      @update:modelValue="handleHistoryStatusChange"
                    />
                  </div>
                  <div class="flex items-center gap-1">
                    <span>{{ t('home.history.filterModel') }}</span>
                    <Select
                      class="w-32"
                      :model-value="historyModelFilter"
                      :options="historyModelOptions"
                      searchable
                      @update:modelValue="handleHistoryModelChange"
                    />
                  </div>
                  <div class="flex items-center gap-1">
                    <span>{{ t('home.history.filterTime') }}</span>
                    <Select
                      class="w-24"
                      :model-value="historyRangeFilter"
                      :options="historyRangeOptions"
                      @update:modelValue="handleHistoryRangeChange"
                    />
                  </div>
                  <button
                    type="button"
                    class="text-xs font-semibold text-orange-600 transition hover:text-orange-700"
                    @click="resetHistoryFilters"
                  >
                    {{ t('home.history.clearFilters') }}
                  </button>
                </div>
              </div>

              <div class="mt-4 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
                <div v-if="activeTab === 'history'" class="space-y-4">
                  <div
                    v-if="historyRefreshing"
                    class="flex items-center gap-2 text-xs text-gray-500 dark:text-dark-400"
                  >
                    <Icon name="refresh" size="xs" class="animate-spin" />
                    {{ t('home.history.refreshing') }}
                  </div>
                  <div v-if="historyError" class="text-xs text-red-500">
                    {{ historyError }}
                  </div>
                  <div
                    v-if="historyLoading && historyTasks.length === 0"
                    class="text-xs text-gray-500 dark:text-dark-400"
                  >
                    {{ t('common.loading') }}
                  </div>
                  <EmptyState
                    v-else-if="historyTasks.length === 0"
                    :title="t('home.history.title')"
                    :description="t('home.history.description')"
                  >
                    <template #icon>
                      <div
                        class="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-50 text-orange-600 dark:bg-dark-800"
                      >
                        <Icon name="clock" size="lg" />
                      </div>
                    </template>
                  </EmptyState>
                  <div v-else class="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    <template v-if="!isVideoMode">
                      <article
                        v-for="task in historyTasks"
                        :key="task.id"
                        class="overflow-hidden rounded-2xl border border-white/30 bg-white/70 shadow-card transition duration-300 dark:border-dark-700/60 dark:bg-dark-900/70"
                        :class="historyImageSource(task) ? 'cursor-zoom-in hover:shadow-card-hover' : ''"
                        @click="openHistoryDetail(task)"
                      >
                        <div
                          class="relative aspect-[5/4] overflow-hidden rounded-b-2xl bg-gray-100 dark:bg-dark-800"
                        >
                          <img
                            v-if="historyImageSource(task)"
                            :src="historyImageSource(task)"
                            :alt="historyPrompt(task)"
                            loading="lazy"
                            class="h-full w-full object-cover"
                          />
                          <div
                            v-else
                            class="flex h-full w-full flex-col items-center justify-center gap-1 bg-gray-100 text-gray-500 dark:bg-dark-800 dark:text-dark-300"
                          >
                            <Icon
                              v-if="isTaskFailed(task)"
                              name="xCircle"
                              size="sm"
                              class="text-red-500"
                            />
                            <Icon
                              v-else-if="task.status === 'succeeded'"
                              name="check"
                              size="sm"
                              class="text-emerald-500"
                            />
                            <Icon v-else name="refresh" size="sm" class="animate-spin" />
                            <span class="text-[11px]" :class="taskStatusClass(task)">
                              {{ taskStatusLabel(task) }}
                            </span>
                          </div>
                        </div>
                        <div class="p-2">
                          <div class="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              class="studio-icon-button"
                              :title="t('gallery.actions.copyPrompt')"
                              @click.stop="copyHistoryPrompt(task)"
                            >
                              <Icon name="copy" size="xs" />
                            </button>
                            <button
                              type="button"
                              class="studio-icon-button"
                              :title="t('gallery.actions.downloadImage')"
                              :class="historyImageSource(task) ? '' : 'pointer-events-none opacity-40'"
                              @click.stop="downloadHistoryImage(task)"
                            >
                              <Icon name="download" size="xs" />
                            </button>
                          </div>
                          <div
                            v-if="shouldShowNextRetry(task)"
                            class="mt-1 text-[10px] text-gray-500 dark:text-dark-400"
                          >
                            {{ t('home.history.nextRetryAt') }}
                            {{ formatDateTime(task.next_attempt_at) }}
                          </div>
                        </div>
                      </article>
                    </template>
                    <template v-else>
                      <article
                        v-for="task in historyTasks"
                        :key="task.id"
                        class="overflow-hidden rounded-2xl border border-white/30 bg-white/70 shadow-card transition duration-300 dark:border-dark-700/60 dark:bg-dark-900/70"
                      >
                        <div
                          class="relative aspect-[5/4] overflow-hidden rounded-b-2xl bg-gray-100 dark:bg-dark-800"
                        >
                          <video
                            v-if="historyVideoSource(task)"
                            :src="historyVideoSource(task)"
                            class="h-full w-full object-cover"
                            preload="metadata"
                            playsinline
                            controls
                          ></video>
                          <div
                            v-else
                            class="flex h-full w-full flex-col items-center justify-center gap-1 bg-gray-100 text-gray-500 dark:bg-dark-800 dark:text-dark-300"
                          >
                            <Icon
                              v-if="isTaskFailed(task)"
                              name="xCircle"
                              size="sm"
                              class="text-red-500"
                            />
                            <Icon
                              v-else-if="task.status === 'succeeded'"
                              name="check"
                              size="sm"
                              class="text-emerald-500"
                            />
                            <Icon v-else name="refresh" size="sm" class="animate-spin" />
                            <span class="text-[11px]" :class="taskStatusClass(task)">
                              {{ taskStatusLabel(task) }}
                            </span>
                          </div>
                        </div>
                        <div class="p-2">
                          <div class="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              class="studio-icon-button"
                              :title="t('gallery.actions.copyPrompt')"
                              @click.stop="copyHistoryPrompt(task)"
                            >
                              <Icon name="copy" size="xs" />
                            </button>
                            <button
                              type="button"
                              class="studio-icon-button"
                              :title="t('home.history.downloadVideo')"
                              :class="historyVideoSource(task) ? '' : 'pointer-events-none opacity-40'"
                              @click.stop="downloadHistoryVideo(task)"
                            >
                              <Icon name="download" size="xs" />
                            </button>
                          </div>
                          <div
                            v-if="shouldShowNextRetry(task)"
                            class="mt-1 text-[10px] text-gray-500 dark:text-dark-400"
                          >
                            {{ t('home.history.nextRetryAt') }}
                            {{ formatDateTime(task.next_attempt_at) }}
                          </div>
                        </div>
                      </article>
                    </template>
                  </div>
                </div>
                <CreativeGallery
                  v-else
                  variant="page"
                  :show-pagination="true"
                  :model-display-names="modelDisplayNames"
                />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>

    <BaseDialog
      v-if="!isVideoMode"
      :show="detailOpen"
      :title="t('home.history.detailTitle')"
      width="full"
      content-class="studio-dialog"
      :close-on-click-outside="true"
      @close="closeHistoryDetail"
    >
      <div v-if="detailLoading" class="text-sm text-gray-500">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="detailError" class="text-sm text-red-500">
        {{ detailError }}
      </div>
      <div v-else class="flex flex-col gap-6 lg:flex-row">
        <div class="flex-1">
          <div class="studio-card p-3">
            <div
              class="relative flex items-center justify-center overflow-hidden rounded-2xl bg-gray-100 dark:bg-dark-800"
            >
              <img
                v-if="detailImageUrl"
                :src="detailImageUrl"
                :alt="detailPrompt"
                class="max-h-[70vh] w-auto rounded-2xl object-contain"
              />
              <div
                v-else
                class="flex h-[320px] w-full items-center justify-center text-gray-500 dark:text-dark-300"
              >
                <Icon
                  v-if="detailTask?.status === 'failed'"
                  name="xCircle"
                  size="sm"
                  class="text-red-500"
                />
                <Icon v-else name="refresh" size="sm" class="animate-spin" />
              </div>
              <div
                v-if="detailPromptVisible"
                class="absolute inset-x-4 bottom-16 rounded-2xl bg-black/70 p-4 text-xs text-white backdrop-blur"
              >
                {{ detailPrompt }}
              </div>
              <div class="absolute bottom-4 right-4 flex gap-2">
                <button
                  type="button"
                  class="studio-icon-button"
                  :title="t('home.history.showPrompt')"
                  @click="toggleDetailPrompt"
                >
                  <Icon name="chat" size="xs" />
                </button>
                <button
                  type="button"
                  class="studio-icon-button"
                  :title="t('home.history.usePrompt')"
                  @click="applyDetailPrompt"
                >
                  <Icon name="edit" size="xs" />
                </button>
              </div>
            </div>
          </div>
          <div v-if="detailImages.length > 1" class="mt-4 grid grid-cols-5 gap-2">
            <button
              v-for="(image, index) in detailImages"
              :key="image.image_url"
              type="button"
              class="group relative aspect-[4/5] overflow-hidden rounded-xl border border-white/40 bg-white/70 shadow-sm dark:border-dark-700/60 dark:bg-dark-900/70"
              :class="index === detailActiveIndex ? 'ring-2 ring-orange-500' : ''"
              @click="selectDetailImage(index)"
            >
              <img :src="image.image_url" alt="" class="h-full w-full object-cover" />
            </button>
          </div>
        </div>
        <div class="w-full lg:w-72">
          <div class="studio-card p-4 text-sm">
            <div class="space-y-3">
              <div>
                <p class="text-xs font-semibold text-gray-500 dark:text-dark-400">
                  {{ t('home.history.detailStatus') }}
                </p>
                <p class="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                  {{ detailStatusLabel }}
                </p>
              </div>
              <div v-if="detailTask?.next_attempt_at">
                <p class="text-xs font-semibold text-gray-500 dark:text-dark-400">
                  {{ t('home.history.detailNextRetryAt') }}
                </p>
                <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">
                  {{ formatDateTime(detailTask?.next_attempt_at) }}
                </p>
              </div>
              <div
                v-if="detailErrorMessage"
                class="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-red-50 p-2 text-xs text-red-600 dark:bg-dark-800/60 dark:text-red-400"
              >
                {{ detailErrorMessage }}
              </div>
              <div>
                <p class="text-xs font-semibold text-gray-500 dark:text-dark-400">
                  {{ t('home.history.detailModel') }}
                </p>
                <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">
                  {{ detailTask?.model || '-' }}
                </p>
              </div>
              <div>
                <p class="text-xs font-semibold text-gray-500 dark:text-dark-400">
                  {{ t('home.history.detailDisplayName') }}
                </p>
                <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">
                  {{ detailModelDisplayName }}
                </p>
              </div>
              <div>
                <p class="text-xs font-semibold text-gray-500 dark:text-dark-400">
                  {{ t('home.history.detailCreatedAt') }}
                </p>
                <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">
                  {{ formatDateTime(detailTask?.created_at) }}
                </p>
              </div>
              <div>
                <p class="text-xs font-semibold text-gray-500 dark:text-dark-400">
                  {{ t('home.history.detailCompletedAt') }}
                </p>
                <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">
                  {{ detailTask?.completed_at ? formatDateTime(detailTask?.completed_at) : '-' }}
                </p>
              </div>
              <div>
                <p class="text-xs font-semibold text-gray-500 dark:text-dark-400">
                  {{ t('home.history.detailSubmission') }}
                </p>
                <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">
                  {{ detailSubmissionLabel }}
                </p>
              </div>
              <div>
                <p class="text-xs font-semibold text-gray-500 dark:text-dark-400">
                  {{ t('home.history.detailPublic') }}
                </p>
                <p class="mt-1 text-sm text-gray-800 dark:text-gray-200">
                  {{ detailIsPublic ? t('common.yes') : t('common.no') }}
                </p>
              </div>
            </div>
          </div>
          <div class="mt-4 grid gap-2">
            <button type="button" class="studio-pill" @click="copyDetailPrompt">
              <Icon name="copy" size="xs" />
              {{ t('gallery.actions.copyPrompt') }}
            </button>
            <button
              type="button"
              class="studio-pill"
              :class="detailImageUrl ? '' : 'pointer-events-none opacity-60'"
              @click="downloadDetailImage"
            >
              <Icon name="download" size="xs" />
              {{ t('gallery.actions.downloadImage') }}
            </button>
            <button
              v-if="canDetailSubmit"
              type="button"
              class="studio-pill bg-gray-900 text-white"
              :class="detailActionLoading ? 'pointer-events-none opacity-60' : ''"
              @click="submitDetailImage"
            >
              <Icon name="upload" size="xs" />
              {{ t('home.history.submitToInspiration') }}
            </button>
            <button
              v-if="canDetailWithdraw"
              type="button"
              class="studio-pill"
              :class="detailActionLoading ? 'pointer-events-none opacity-60' : ''"
              @click="withdrawDetailSubmission"
            >
              <Icon name="xCircle" size="xs" />
              {{ t('home.history.withdraw') }}
            </button>
            <button
              v-if="detailIsPublic"
              type="button"
              class="studio-pill"
              :class="detailActionLoading ? 'pointer-events-none opacity-60' : ''"
              @click="unpublishDetailImage"
            >
              <Icon name="eyeOff" size="xs" />
              {{ t('home.history.unpublish') }}
            </button>
            <button
              type="button"
              class="studio-pill text-red-500"
              :class="detailDeleteLoading ? 'pointer-events-none opacity-60' : ''"
              @click="deleteDetailTask"
            >
              <Icon name="trash" size="xs" />
              {{ t('home.history.delete') }}
            </button>
          </div>
        </div>
      </div>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useResizeObserver } from '@vueuse/core'
import { useAuthStore, useAppStore } from '@/stores'
import { useClipboard } from '@/composables/useClipboard'
import { imagesAPI, modelSettingsAPI, videosAPI } from '@/api'
import { submitGalleryImage, updateGalleryVisibility, withdrawGallerySubmission } from '@/api/gallery'
import type { NewAPIModel, UserModelSetting } from '@/api/modelSettings'
import type {
  GalleryImage,
  ImageGenerationTask,
  ImageGenerationTaskDetail,
  ImageHistoryImage,
  VideoGenerationTask
} from '@/types'
import LocaleSwitcher from '@/components/common/LocaleSwitcher.vue'
import Select from '@/components/common/Select.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Icon from '@/components/icons/Icon.vue'
import CreativeGallery from '@/components/gallery/CreativeGallery.vue'
import { formatDateTime } from '@/utils/format'

const { t } = useI18n()
const { copyToClipboard } = useClipboard()

const props = withDefaults(defineProps<{
  mode?: 'image' | 'video'
  showHeader?: boolean
  allowHomeContent?: boolean
  embedded?: boolean
}>(), {
  showHeader: true,
  allowHomeContent: true,
  embedded: false
})

const authStore = useAuthStore()
const appStore = useAppStore()

const siteName = computed(
  () => appStore.cachedPublicSettings?.site_name || appStore.siteName || 'Sub2API'
)
const siteLogo = computed(() => appStore.cachedPublicSettings?.site_logo || appStore.siteLogo || '')
const docUrl = computed(() => appStore.cachedPublicSettings?.doc_url || appStore.docUrl || '')
const homeContent = computed(() => appStore.cachedPublicSettings?.home_content || '')
const showHomeContent = computed(() => props.allowHomeContent && homeContent.value)
const showHeader = computed(() => props.showHeader)
const showBackdrop = computed(() => !props.embedded)
const homeContentClass = computed(() => (props.embedded ? 'min-h-full' : 'min-h-screen'))
const shellClass = computed(() => [
  props.embedded
    ? 'studio-embed relative flex min-h-full flex-col lg:h-full lg:overflow-hidden'
    : 'studio-shell relative flex min-h-screen flex-col lg:h-screen lg:overflow-hidden'
])
const panelCardClass = computed(() => (props.embedded ? '' : 'studio-card'))
const panelToneClassLeft = computed(() => (props.embedded ? 'studio-panel studio-panel-left' : ''))
const panelToneClassRight = computed(() =>
  props.embedded ? 'studio-panel studio-panel-right studio-panel-divider' : ''
)

const isHomeContentUrl = computed(() => {
  const content = homeContent.value.trim()
  return content.startsWith('http://') || content.startsWith('https://')
})

const isAuthenticated = computed(() => authStore.isAuthenticated)
const isAdmin = computed(() => authStore.isAdmin)
const dashboardPath = computed(() => (isAdmin.value ? '/admin/dashboard' : '/dashboard'))
const userInitial = computed(() => {
  const user = authStore.user
  if (!user || !user.email) return ''
  return user.email.charAt(0).toUpperCase()
})

const isDark = ref(document.documentElement.classList.contains('dark'))
const activeMode = ref<'image' | 'video'>(props.mode ?? 'image')
const isVideoMode = computed(() => activeMode.value === 'video')
const activeTab = ref<'history' | 'creative'>('creative')
const showModeToggle = computed(() => !props.mode)
const showModeBadge = computed(() => !showModeToggle.value && !props.embedded)

watch(
  () => props.mode,
  (mode) => {
    if (mode) {
      activeMode.value = mode
    }
  },
  { immediate: true }
)

const leftPanelRef = ref<HTMLElement | null>(null)
const leftContentRef = ref<HTMLElement | null>(null)
const autoScaleEnabled = ref(false)
const scale = ref(1)

const promptInputId = 'home-prompt'
const promptLimit = 5000
const prompt = ref('')
const promptCount = computed(() => prompt.value.length)

const referenceImage = ref<File | null>(null)
const referencePreview = ref('')
const dropActive = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const models = ref<NewAPIModel[]>([])
const modelSettings = ref<Record<string, UserModelSetting>>({})
const modelsLoading = ref(false)
const modelsError = ref('')
type HistoryTask = ImageGenerationTask | VideoGenerationTask

const historyTasks = ref<HistoryTask[]>([])
const historyLoading = ref(false)
const historyRefreshing = ref(false)
const historyError = ref('')
const historyStatusFilter = ref('all')
const historyModelFilter = ref('all')
const historyRangeFilter = ref('all')
const historyPageSize = 12
const generating = ref(false)
const optimizingPrompt = ref(false)
const detailOpen = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const detailTask = ref<ImageGenerationTaskDetail | null>(null)
const detailActiveIndex = ref(0)
const detailPromptVisible = ref(false)
const detailActionLoading = ref(false)
const detailDeleteLoading = ref(false)

const hasPendingTasks = computed(() =>
  historyTasks.value.some((task) => task.status === 'pending' || task.status === 'running')
)

const historyStatusOptions = computed(() => [
  { value: 'all', label: t('common.all') },
  { value: 'pending', label: t('home.history.statusPending') },
  { value: 'running', label: t('home.history.statusRunning') },
  { value: 'succeeded', label: t('home.history.statusSucceeded') },
  { value: 'failed', label: t('home.history.statusFailed') }
])

const historyModelOptions = computed(() => {
  const options = [{ value: 'all', label: t('common.all') }]
  const seen = new Set<string>()
  for (const model of models.value) {
    const requestId = resolveRequestModelId(model.id)
    if (seen.has(requestId)) continue
    seen.add(requestId)
    options.push({
      value: requestId,
      label: resolveModelDisplayName(model)
    })
  }
  return options
})

const historyRangeOptions = computed(() => [
  { value: 'all', label: t('home.history.rangeAll') },
  { value: '24h', label: t('home.history.range24h') },
  { value: '7d', label: t('home.history.range7d') },
  { value: '30d', label: t('home.history.range30d') }
])

const detailImages = computed<ImageHistoryImage[]>(() => detailTask.value?.images || [])
const detailActiveImage = computed(() => detailImages.value[detailActiveIndex.value] || null)
const detailImageUrl = computed(() => detailActiveImage.value?.image_url || '')
const detailPrompt = computed(() => detailTask.value?.prompt?.trim() || t('gallery.promptFallback'))
const detailModelDisplayName = computed(() => {
  const displayName = resolveModelDisplayNameById(detailTask.value?.model)
  return displayName || '-'
})
const detailStatusLabel = computed(() => taskStatusLabel(detailTask.value))
const detailErrorMessage = computed(() => {
  const message = detailTask.value?.error_message || detailTask.value?.last_error || ''
  return message.trim()
})
const detailSubmissionStatus = computed(() => detailActiveImage.value?.gallery?.submission_status || 'none')
const detailSubmissionLabel = computed(() => submissionStatusLabel(detailSubmissionStatus.value))
const detailGalleryId = computed(() => detailActiveImage.value?.gallery?.id || 0)
const detailIsPublic = computed(() => detailActiveImage.value?.gallery?.is_public === true)
const canDetailSubmit = computed(() => {
  if (!detailImageUrl.value) return false
  if (detailTask.value?.status === 'failed') return false
  return detailSubmissionStatus.value === 'none' || detailSubmissionStatus.value === 'rejected'
})
const canDetailWithdraw = computed(
  () => detailGalleryId.value > 0 && detailSubmissionStatus.value === 'pending'
)

let historyPoller: ReturnType<typeof setInterval> | null = null
let historyFetchInFlight = false

const selectedModel = ref('')
const selectedResolution = ref('')
const selectedRatio = ref('')
const imageCount = ref<number | null>(1)
const videoDuration = ref<number | null>(null)
const videoWidth = ref<number | null>(null)
const videoHeight = ref<number | null>(null)
const videoFps = ref<number | null>(null)
const videoSeed = ref<number | null>(null)
const videoCount = ref<number | null>(1)

const defaultResolutions = ['1K', '2K', '4K']
const defaultRatios = [
  'Auto',
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9'
]
const ratioLabelMap: Record<string, string> = {
  Auto: 'Auto',
  '1:1': '1:1',
  '2:3': '2:3',
  '3:2': '3:2',
  '3:4': '3:4',
  '4:3': '4:3',
  '4:5': '4:5',
  '5:4': '5:4',
  '9:16': '9:16',
  '16:9': '16:9',
  '21:9': '21:9'
}

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

function resolveModelDisplayNameById(modelId?: string | null): string {
  const trimmed = modelId?.trim()
  if (!trimmed) return ''
  const custom = modelSettings.value[trimmed]?.display_name?.trim()
  if (custom) return custom
  const override = Object.values(modelSettings.value).find(
    (setting) => setting.request_model_id?.trim() === trimmed
  )
  if (override) {
    const overrideName = override.display_name?.trim()
    if (overrideName) return overrideName
    const model = models.value.find((item) => item.id === override.model_id)
    if (model?.name) return model.name
    return override.model_id
  }
  const model = models.value.find((item) => item.id === trimmed)
  return model?.name || trimmed
}

const resolveRequestModelId = (modelId: string) => {
  const custom = modelSettings.value[modelId]?.request_model_id?.trim()
  return custom || modelId
}

const isModelVisibleForMode = (modelId: string) => {
  const modelType = normalizeModelType(modelSettings.value[modelId]?.model_type)
  if (modelType === 'text') return false
  return isVideoMode.value ? modelType === 'video' : modelType === 'image'
}

const modelOptions = computed(() =>
  models.value
    .filter((model) => isModelVisibleForMode(model.id))
    .map((model) => ({
      value: model.id,
      label: resolveModelDisplayName(model)
    }))
)

const modelDisplayNames = computed(() => {
  const map: Record<string, string> = {}
  for (const model of models.value) {
    map[model.id] = resolveModelDisplayNameById(model.id)
  }
  for (const modelId of Object.keys(modelSettings.value)) {
    if (!map[modelId]) {
      map[modelId] = resolveModelDisplayNameById(modelId)
    }
  }
  for (const setting of Object.values(modelSettings.value)) {
    const requestId = setting.request_model_id?.trim()
    if (requestId && !map[requestId]) {
      map[requestId] = resolveModelDisplayNameById(requestId)
    }
  }
  return map
})

const availableResolutions = computed(() => {
  const setting = modelSettings.value[selectedModel.value]
  if (setting?.resolutions?.length) return setting.resolutions
  return defaultResolutions
})

const availableRatios = computed(() => {
  const setting = modelSettings.value[selectedModel.value]
  if (setting?.aspect_ratios?.length) return setting.aspect_ratios
  return defaultRatios
})

const ratioOptions = computed(() =>
  availableRatios.value.map((ratio) => ({
    value: ratio,
    label: ratioLabelMap[ratio] ?? ratio
  }))
)

const resolutionOptions = computed(() =>
  availableResolutions.value.map((resolution) => ({
    value: resolution,
    label: resolution
  }))
)

const scaleStyle = computed(() => {
  if (!autoScaleEnabled.value || isVideoMode.value) return {}
  return {
    transform: `scale(${scale.value})`
  }
})

const showModelSettingsHint = computed(() => {
  if (!isAuthenticated.value || !selectedModel.value) return false
  if (isVideoMode.value) return false
  const setting = modelSettings.value[selectedModel.value]
  if (!setting) return true
  return !setting.resolutions.length || !setting.aspect_ratios.length
})

const canGenerate = computed(() => {
  if (!isAuthenticated.value || selectedModel.value === '') return false
  const hasPrompt = prompt.value.trim().length > 0
  if (hasPrompt) return true
  return isVideoMode.value && referencePreview.value !== ''
})

const canOptimizePrompt = computed(() => {
  return isAuthenticated.value && prompt.value.trim().length > 0
})

const historyImageSource = (task: HistoryTask): string => {
  if (!('image_urls' in task) && !('primary_image' in task)) return ''
  const imageTask = task as ImageGenerationTask
  return imageTask.primary_image?.image_url || imageTask.image_urls?.[0] || ''
}

const historyVideoSource = (task: HistoryTask): string => {
  if (!('video_urls' in task) && !('primary_video' in task)) return ''
  const videoTask = task as VideoGenerationTask
  return videoTask.primary_video?.video_url || videoTask.video_urls?.[0] || ''
}

const historyPrompt = (task: HistoryTask): string => {
  return task.prompt?.trim() || t('gallery.promptFallback')
}

const isTaskFailed = (task: HistoryTask): boolean => {
  return task.status === 'failed'
}

const historyStatusLabel = (status: string): string => {
  switch (status) {
    case 'pending':
      return t('home.history.statusPending')
    case 'running':
      return t('home.history.statusRunning')
    case 'succeeded':
      return t('home.history.statusSucceeded')
    case 'failed':
      return t('home.history.statusFailed')
    default:
      return status
  }
}

const isTaskRetrying = (task: HistoryTask | null | undefined): boolean => {
  if (!task) return false
  return task.status === 'pending' && !!task.next_attempt_at && (task.attempts ?? 0) > 0
}

const taskStatusLabel = (task: HistoryTask | null | undefined): string => {
  if (!task) return ''
  if (isTaskRetrying(task)) return t('home.history.statusRetrying')
  return historyStatusLabel(task.status)
}

const taskStatusClass = (task: HistoryTask | null | undefined): string => {
  if (!task) return ''
  if (isTaskFailed(task)) return 'text-red-500'
  if (isTaskRetrying(task)) return 'text-orange-600'
  if (task.status === 'succeeded') return 'text-emerald-600'
  if (task.status === 'running') return 'text-blue-600'
  return 'text-gray-500'
}

const shouldShowNextRetry = (task: HistoryTask | null | undefined): boolean => {
  return !!task?.next_attempt_at && isTaskRetrying(task)
}

const submissionStatusLabel = (status: string): string => {
  switch (status) {
    case 'pending':
      return t('home.history.submissionPending')
    case 'approved':
      return t('home.history.submissionApproved')
    case 'rejected':
      return t('home.history.submissionRejected')
    default:
      return t('home.history.submissionNone')
  }
}

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

function initTheme() {
  const savedTheme = localStorage.getItem('theme')
  if (
    savedTheme === 'dark' ||
    (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
  ) {
    isDark.value = true
    document.documentElement.classList.add('dark')
  }
}

function handleModelChange(value: string | number | boolean | null) {
  selectedModel.value = value ? String(value) : ''
}

function handleRatioChange(value: string | number | boolean | null) {
  selectedRatio.value = value ? String(value) : ''
}

function handleResolutionChange(value: string | number | boolean | null) {
  selectedResolution.value = value ? String(value) : ''
}

function handleHistoryStatusChange(value: string | number | boolean | null) {
  historyStatusFilter.value = value ? String(value) : 'all'
}

function handleHistoryModelChange(value: string | number | boolean | null) {
  historyModelFilter.value = value ? String(value) : 'all'
}

function handleHistoryRangeChange(value: string | number | boolean | null) {
  historyRangeFilter.value = value ? String(value) : 'all'
}

function resetHistoryFilters() {
  historyStatusFilter.value = 'all'
  historyModelFilter.value = 'all'
  historyRangeFilter.value = 'all'
}

function updateScale() {
  if (!autoScaleEnabled.value || isVideoMode.value) {
    scale.value = 1
    return
  }
  const panel = leftPanelRef.value
  const content = leftContentRef.value
  if (!panel || !content) {
    scale.value = 1
    return
  }
  const styles = window.getComputedStyle(panel)
  const paddingTop = Number.parseFloat(styles.paddingTop) || 0
  const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0
  const available = panel.clientHeight - paddingTop - paddingBottom
  const required = content.scrollHeight
  if (!available || !required) {
    scale.value = 1
    return
  }
  const nextScale = Math.min(1, available / required)
  const snappedScale = nextScale >= 0.98 ? 1 : nextScale
  scale.value = Number.isFinite(snappedScale) ? Number(snappedScale.toFixed(4)) : 1
}

async function loadModelData() {
  modelsLoading.value = true
  modelsError.value = ''

  try {
    const settingsResult = await modelSettingsAPI.getUserModelSettings()
    const next: Record<string, UserModelSetting> = {}
    for (const item of settingsResult.items || []) {
      if (!item.model_id) continue
      next[item.model_id] = {
        model_id: item.model_id,
        request_model_id: item.request_model_id?.trim() || '',
        resolutions: [...(item.resolutions || [])],
        aspect_ratios: [...(item.aspect_ratios || [])],
        durations: [...(item.durations || [])],
        request_endpoint: item.request_endpoint,
        model_type: item.model_type,
        display_name: item.display_name?.trim() || ''
      }
    }
    modelSettings.value = next
    models.value = Object.values(next)
      .filter((item) => item.model_id)
      .map((item) => ({
        id: item.model_id,
        name: item.display_name?.trim() || item.model_id
      }))
  } catch (error: any) {
    models.value = []
    modelSettings.value = {}
    modelsError.value = t('home.generator.modelLoadFailed')
  }

  modelsLoading.value = false
}

function buildHistoryParams() {
  const params: Record<string, string | number> = {
    page: 1,
    page_size: historyPageSize
  }

  if (historyStatusFilter.value !== 'all') {
    params.status = historyStatusFilter.value
  }
  if (historyModelFilter.value !== 'all') {
    params.model = historyModelFilter.value
  }

  const range = historyRangeFilter.value
  if (range !== 'all') {
    const now = new Date()
    const start = new Date(now)
    switch (range) {
      case '24h':
        start.setHours(start.getHours() - 24)
        break
      case '7d':
        start.setDate(start.getDate() - 7)
        break
      case '30d':
        start.setDate(start.getDate() - 30)
        break
      default:
        break
    }
    params.start_time = start.toISOString()
    params.end_time = now.toISOString()
  }

  return params
}

async function loadHistory(options: { silent?: boolean } = {}) {
  if (!isAuthenticated.value) {
    historyTasks.value = []
    historyError.value = ''
    return
  }

  if (historyFetchInFlight) {
    return
  }
  historyFetchInFlight = true

  const silent = options.silent === true
  if (silent) {
    historyRefreshing.value = true
  } else {
    historyLoading.value = true
    historyError.value = ''
  }

  try {
    const data = isVideoMode.value
      ? await videosAPI.listVideoHistory(buildHistoryParams())
      : await imagesAPI.listImageHistory(buildHistoryParams())
    historyTasks.value = data.items || []
    historyError.value = ''
  } catch (error: any) {
    if (!silent || historyTasks.value.length === 0) {
      historyError.value = error?.message || t('home.history.loadFailed')
    }
  } finally {
    historyFetchInFlight = false
    if (silent) {
      historyRefreshing.value = false
    } else {
      historyLoading.value = false
    }
  }
}

async function copyHistoryPrompt(task: HistoryTask) {
  const text = historyPrompt(task)
  await copyToClipboard(text)
}

async function openHistoryDetail(task: HistoryTask) {
  if (isVideoMode.value) return
  if (!task?.id) return
  detailOpen.value = true
  detailLoading.value = true
  detailError.value = ''
  detailPromptVisible.value = false
  detailActiveIndex.value = 0
  detailTask.value = null
  detailActionLoading.value = false
  detailDeleteLoading.value = false

  try {
    const data = await imagesAPI.getImageHistoryTask(task.id)
    detailTask.value = data
    detailError.value = ''
  } catch (error: any) {
    detailError.value = error?.message || t('home.history.detailLoadFailed')
  } finally {
    detailLoading.value = false
  }
}

function closeHistoryDetail() {
  detailOpen.value = false
  detailLoading.value = false
  detailError.value = ''
  detailTask.value = null
  detailActiveIndex.value = 0
  detailPromptVisible.value = false
  detailActionLoading.value = false
  detailDeleteLoading.value = false
}

function selectDetailImage(index: number) {
  detailActiveIndex.value = index
}

function toggleDetailPrompt() {
  if (!detailPrompt.value) return
  detailPromptVisible.value = !detailPromptVisible.value
}

function applyDetailPrompt() {
  if (!detailPrompt.value) return
  prompt.value = detailPrompt.value
  detailOpen.value = false
}

async function downloadHistoryImage(task: HistoryTask) {
  if (!('image_urls' in task) && !('primary_image' in task)) return
  const url = historyImageSource(task)
  if (!url) return

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Download failed')
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = `dreamstudio-history-${task.id || 'image'}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

async function downloadHistoryVideo(task: HistoryTask) {
  const url = historyVideoSource(task)
  if (!url) return

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Download failed')
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = `dreamstudio-history-${task.id}.mp4`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

async function copyDetailPrompt() {
  await copyToClipboard(detailPrompt.value)
}

async function downloadDetailImage() {
  const url = detailImageUrl.value
  if (!url) return
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Download failed')
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = `dreamstudio-history-${detailTask.value?.id || 'image'}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

async function submitDetailImage() {
  if (detailActionLoading.value || !detailImageUrl.value) return
  detailActionLoading.value = true
  try {
    const image = await submitGalleryImage({ image_url: detailImageUrl.value })
    syncHistoryGallery(detailTask.value?.id || 0, detailImageUrl.value, image)
    syncDetailGallery(detailImageUrl.value, image)
    if (image.submission_status === 'approved') {
      appStore.showSuccess(t('home.history.submitApproved'))
    } else {
      appStore.showInfo(t('home.history.submitPending'))
    }
  } catch (error: any) {
    appStore.showError(error?.message || t('home.history.submitFailed'))
  } finally {
    detailActionLoading.value = false
  }
}

async function withdrawDetailSubmission() {
  if (detailActionLoading.value || detailGalleryId.value <= 0) return
  detailActionLoading.value = true
  try {
    const image = await withdrawGallerySubmission(detailGalleryId.value)
    syncHistoryGallery(detailTask.value?.id || 0, detailImageUrl.value, image)
    syncDetailGallery(detailImageUrl.value, image)
    appStore.showSuccess(t('home.history.withdrawSuccess'))
  } catch (error: any) {
    appStore.showError(error?.message || t('home.history.withdrawFailed'))
  } finally {
    detailActionLoading.value = false
  }
}

async function unpublishDetailImage() {
  if (detailActionLoading.value || detailGalleryId.value <= 0) return
  detailActionLoading.value = true
  try {
    await updateGalleryVisibility(detailGalleryId.value, { is_public: false })
    if (detailActiveImage.value?.gallery) {
      detailActiveImage.value.gallery.is_public = false
      syncHistoryGallery(detailTask.value?.id || 0, detailImageUrl.value, detailActiveImage.value.gallery)
    }
    appStore.showSuccess(t('home.history.unpublishSuccess'))
  } catch (error: any) {
    appStore.showError(error?.message || t('home.history.unpublishFailed'))
  } finally {
    detailActionLoading.value = false
  }
}

async function deleteDetailTask() {
  if (!detailTask.value?.id || detailDeleteLoading.value) return
  const confirmed = window.confirm(t('home.history.deleteConfirm'))
  if (!confirmed) return
  detailDeleteLoading.value = true
  try {
    const result = await imagesAPI.deleteImageHistoryTask(detailTask.value.id)
    historyTasks.value = historyTasks.value.filter((task) => task.id !== detailTask.value?.id)
    if (result?.warnings?.length) {
      appStore.showWarning(result.warnings.join(', '))
    } else {
      appStore.showSuccess(t('home.history.deleteSuccess'))
    }
    closeHistoryDetail()
  } catch (error: any) {
    appStore.showError(error?.message || t('home.history.deleteFailed'))
  } finally {
    detailDeleteLoading.value = false
  }
}

function syncHistoryGallery(taskId: number, imageUrl: string, gallery: GalleryImage) {
  if (!taskId) return
  historyTasks.value = historyTasks.value.map((task) => {
    if (task.id !== taskId) return task
    if (!('image_urls' in task)) return task
    const imageTask = task as ImageGenerationTask
    const primaryUrl = imageTask.primary_image?.image_url || imageTask.image_urls?.[0] || ''
    if (primaryUrl !== imageUrl) return task
    const primary = imageTask.primary_image?.image_url ? imageTask.primary_image : { image_url: primaryUrl }
    return {
      ...imageTask,
      primary_image: { ...primary, gallery }
    }
  })
}

function syncDetailGallery(imageUrl: string, gallery: GalleryImage) {
  if (!detailTask.value) return
  detailTask.value.images = detailTask.value.images.map((image) =>
    image.image_url === imageUrl ? { ...image, gallery } : image
  )
  if (detailTask.value.primary_image?.image_url === imageUrl) {
    detailTask.value.primary_image = { ...detailTask.value.primary_image, gallery }
  }
}


function startHistoryPolling() {
  if (historyPoller) return
  historyPoller = setInterval(() => {
    if (!hasPendingTasks.value) {
      stopHistoryPolling()
      return
    }
    loadHistory({ silent: true })
  }, 5000)
}

function stopHistoryPolling() {
  if (!historyPoller) return
  clearInterval(historyPoller)
  historyPoller = null
}

function handleDragOver() {
  dropActive.value = true
}

function handleDragLeave() {
  dropActive.value = false
}

function handleDrop(event: DragEvent) {
  dropActive.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) setReferenceImage(file)
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) setReferenceImage(file)
  input.value = ''
}

function openFilePicker() {
  fileInputRef.value?.click()
}

function clearImage() {
  revokePreviewUrl()
  referenceImage.value = null
  referencePreview.value = ''
}

function setReferenceImage(file: File) {
  if (!file.type.startsWith('image/')) {
    appStore.showError(t('home.generator.invalidImage'))
    return
  }

  referenceImage.value = file
  revokePreviewUrl()
  const currentFile = file
  const reader = new FileReader()
  reader.onload = () => {
    if (referenceImage.value !== currentFile) return
    const result = reader.result
    referencePreview.value = typeof result === 'string' ? result : ''
  }
  reader.onerror = () => {
    if (referenceImage.value !== currentFile) return
    referencePreview.value = ''
    appStore.showError(t('home.generator.invalidImage'))
  }
  reader.readAsDataURL(file)
}

function revokePreviewUrl() {
  if (referencePreview.value.startsWith('blob:')) {
    URL.revokeObjectURL(referencePreview.value)
  }
}

function normalizeVideoValue(value: number | null, min = 1): number | undefined {
  if (value === null || Number.isNaN(value)) return undefined
  if (value < min) return undefined
  return value
}

function normalizeVideoCount(value: number | null): number | undefined {
  const normalized = normalizeVideoValue(value, 1)
  if (!normalized) return undefined
  if (normalized > 4) return 4
  return normalized
}

function normalizeImageCount(value: number | null): number {
  const normalized = normalizeVideoValue(value, 1)
  if (!normalized) return 1
  if (normalized > 4) return 4
  return normalized
}

async function handleGenerate() {
  if (!isAuthenticated.value) {
    appStore.showError(t('home.generator.loginHint'))
    return
  }
  if (!selectedModel.value) {
    appStore.showError(t('home.generator.modelRequired'))
    return
  }
  if (!prompt.value.trim() && !(isVideoMode.value && referencePreview.value)) {
    appStore.showError(t('home.generator.promptRequired'))
    return
  }
  if (generating.value) {
    return
  }
  generating.value = true
  const requestModelId = resolveRequestModelId(selectedModel.value)
  try {
    if (isVideoMode.value) {
      const task = await videosAPI.createVideoTask({
        model_id: requestModelId,
        prompt: prompt.value.trim(),
        image: referencePreview.value || undefined,
        duration: normalizeVideoValue(videoDuration.value),
        width: normalizeVideoValue(videoWidth.value),
        height: normalizeVideoValue(videoHeight.value),
        fps: normalizeVideoValue(videoFps.value),
        seed: normalizeVideoValue(videoSeed.value, 0),
        count: normalizeVideoCount(videoCount.value),
        async: true
      })
      if (task && task.id) {
        historyTasks.value = [task, ...historyTasks.value.filter((item) => item.id !== task.id)]
      }
      activeTab.value = 'history'
      await loadHistory({ silent: true })
      appStore.showSuccess(t('home.generator.generateVideoSuccess'))
      return
    }

    const payload = {
      model_id: requestModelId,
      prompt: prompt.value.trim(),
      resolution: selectedResolution.value,
      aspect_ratio: selectedRatio.value,
      reference_image: referencePreview.value || undefined,
      async: true
    }
    const count = normalizeImageCount(imageCount.value)
    const results = await Promise.allSettled(
      Array.from({ length: count }, () => imagesAPI.createImageTask(payload))
    )
    const tasks = results
      .filter((result): result is PromiseFulfilledResult<ImageGenerationTask> => result.status === 'fulfilled')
      .map((result) => result.value)
    const errors = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason?.message || t('common.unknownError'))

    if (tasks.length) {
      const taskIds = new Set(tasks.map((item) => item.id))
      historyTasks.value = [...tasks, ...historyTasks.value.filter((item) => !taskIds.has(item.id))]
      activeTab.value = 'history'
      await loadHistory({ silent: true })
    }

    if (!tasks.length) {
      const errorMessage = errors[0] || t('common.unknownError')
      appStore.showError(`${t('home.generator.generateFailed')}: ${errorMessage}`)
      return
    }

    if (tasks.length < count) {
      appStore.showWarning(t('home.generator.generatePartial', { success: tasks.length, total: count }))
    } else {
      appStore.showSuccess(t('home.generator.generateSuccess'))
    }
  } catch (error: any) {
    appStore.showError(
      (isVideoMode.value ? t('home.generator.generateVideoFailed') : t('home.generator.generateFailed')) +
        ': ' +
        (error.message || t('common.unknownError'))
    )
  } finally {
    generating.value = false
  }
}

async function handleOptimizePrompt() {
  if (!isAuthenticated.value) {
    appStore.showError(t('home.generator.loginHint'))
    return
  }
  if (!prompt.value.trim()) {
    appStore.showError(t('home.generator.promptRequired'))
    return
  }
  if (optimizingPrompt.value) {
    return
  }
  optimizingPrompt.value = true
  try {
    const result = await imagesAPI.optimizePrompt({ prompt: prompt.value.trim() })
    const optimized = result?.prompt?.trim()
    if (optimized) {
      prompt.value = optimized
      appStore.showSuccess(t('home.generator.optimizeSuccess'))
    } else {
      appStore.showError(t('home.generator.optimizeFailed'))
    }
  } catch (error: any) {
    appStore.showError(
      t('home.generator.optimizeFailed') + ': ' + (error.message || t('common.unknownError'))
    )
  } finally {
    optimizingPrompt.value = false
  }
}

function clearPrompt() {
  prompt.value = ''
}

watch(modelOptions, (options) => {
  if (options.length === 0) {
    selectedModel.value = ''
    return
  }
  if (!selectedModel.value || !options.some((opt) => opt.value === selectedModel.value)) {
    selectedModel.value = String(options[0].value || '')
  }
}, { immediate: true })

watch(availableRatios, (ratios) => {
  if (!ratios.length) {
    selectedRatio.value = ''
    return
  }
  if (!ratios.includes(selectedRatio.value)) {
    selectedRatio.value = ratios[0]
  }
}, { immediate: true })

watch(availableResolutions, (resolutions) => {
  if (!resolutions.length) {
    selectedResolution.value = ''
    return
  }
  if (!resolutions.includes(selectedResolution.value)) {
    selectedResolution.value = resolutions[0]
  }
}, { immediate: true })

watch(isAuthenticated, (value) => {
  if (value) {
    loadModelData()
    loadHistory()
  } else {
    models.value = []
    modelSettings.value = {}
    modelsError.value = ''
    selectedModel.value = ''
    historyTasks.value = []
    historyError.value = ''
    historyLoading.value = false
  }
}, { immediate: true })

watch(activeMode, async () => {
  closeHistoryDetail()
  await nextTick()
  updateScale()
  if (!isAuthenticated.value) return
  loadHistory()
})

watch(referencePreview, async () => {
  await nextTick()
  updateScale()
})

watch([historyStatusFilter, historyModelFilter, historyRangeFilter], () => {
  if (!isAuthenticated.value) return
  loadHistory()
})

watch(hasPendingTasks, (value) => {
  if (value) {
    startHistoryPolling()
  } else {
    stopHistoryPolling()
  }
}, { immediate: true })

onMounted(() => {
  initTheme()
  authStore.checkAuth()
  if (!appStore.publicSettingsLoaded) {
    appStore.fetchPublicSettings()
  }
  nextTick(() => {
    updateScale()
  })
})

onUnmounted(() => {
  revokePreviewUrl()
  stopHistoryPolling()
})

let desktopQuery: MediaQueryList | null = null

const handleDesktopChange = (event: MediaQueryListEvent) => {
  autoScaleEnabled.value = event.matches
  updateScale()
}

onMounted(() => {
  desktopQuery = window.matchMedia('(min-width: 1024px)')
  autoScaleEnabled.value = desktopQuery.matches
  updateScale()

  if (desktopQuery.addEventListener) {
    desktopQuery.addEventListener('change', handleDesktopChange)
  } else {
    desktopQuery.addListener(handleDesktopChange)
  }
})

onUnmounted(() => {
  if (!desktopQuery) return
  if (desktopQuery.removeEventListener) {
    desktopQuery.removeEventListener('change', handleDesktopChange)
  } else {
    desktopQuery.removeListener(handleDesktopChange)
  }
})

useResizeObserver(leftPanelRef, () => {
  updateScale()
})

useResizeObserver(leftContentRef, () => {
  updateScale()
})
</script>
