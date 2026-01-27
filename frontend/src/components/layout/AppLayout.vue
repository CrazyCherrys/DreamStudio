<template>
  <div class="min-h-screen bg-gray-50 dark:bg-dark-950">
    <!-- Background Decoration -->
    <div class="pointer-events-none fixed inset-0 bg-mesh-gradient"></div>

    <!-- Sidebar -->
    <AppSidebar />

    <!-- Main Content Area -->
    <div :class="contentClass">
      <!-- Header -->
      <AppHeader />

      <!-- Main Content -->
      <main :class="mainClass">
        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import '@/styles/onboarding.css'
import { computed, onMounted } from 'vue'
import { useAppStore } from '@/stores'
import { useAuthStore } from '@/stores/auth'
import { useOnboardingTour } from '@/composables/useOnboardingTour'
import { useOnboardingStore } from '@/stores/onboarding'
import AppSidebar from './AppSidebar.vue'
import AppHeader from './AppHeader.vue'

const props = withDefaults(defineProps<{
  fullBleed?: boolean
}>(), {
  fullBleed: false
})

const appStore = useAppStore()
const authStore = useAuthStore()
const sidebarCollapsed = computed(() => appStore.sidebarCollapsed)
const isAdmin = computed(() => authStore.user?.role === 'admin')
const contentClass = computed(() => [
  'relative flex flex-col transition-all duration-300',
  props.fullBleed ? 'h-screen' : 'min-h-screen',
  sidebarCollapsed.value ? 'lg:ml-[72px]' : 'lg:ml-56'
])
const mainClass = computed(() =>
  props.fullBleed
    ? 'flex-1 min-h-0 overflow-auto lg:overflow-hidden'
    : 'flex-1 p-4 md:p-6 lg:p-8'
)

const { replayTour } = useOnboardingTour({
  storageKey: isAdmin.value ? 'admin_guide' : 'user_guide',
  autoStart: true
})

const onboardingStore = useOnboardingStore()

onMounted(() => {
  onboardingStore.setReplayCallback(replayTour)
})

defineExpose({ replayTour })
</script>
