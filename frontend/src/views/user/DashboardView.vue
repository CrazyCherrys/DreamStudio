<template>
  <AppLayout>
    <div class="space-y-6">
      <div v-if="loading" class="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
      <template v-else>
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div class="card p-6">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">Welcome back</p>
            <p class="mt-2 text-xl font-semibold text-gray-900 dark:text-white">
              {{ displayName }}
            </p>
            <p class="mt-1 text-xs uppercase text-gray-500 dark:text-dark-400">
              {{ user?.role || 'user' }}
            </p>
          </div>
          <div class="card p-6">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">Balance</p>
            <p class="mt-2 text-2xl font-bold text-primary-600 dark:text-primary-400">
              ${{ balance }}
            </p>
            <p class="mt-1 text-xs text-gray-500 dark:text-dark-400">Available</p>
          </div>
          <div class="card p-6">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400">Account</p>
            <div class="mt-2 flex items-center gap-2">
              <span
                class="h-2 w-2 rounded-full"
                :class="user?.status === 'active' ? 'bg-green-500' : 'bg-red-500'"
              ></span>
              <span class="text-sm font-medium text-gray-900 dark:text-white">
                {{ user?.status || 'unknown' }}
              </span>
            </div>
            <p class="mt-2 text-xs text-gray-500 dark:text-dark-400">
              Concurrency: {{ user?.concurrency ?? 0 }}
            </p>
          </div>
        </div>
        <div class="card flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p class="text-sm font-medium text-gray-900 dark:text-white">Profile settings</p>
            <p class="mt-1 text-xs text-gray-500 dark:text-dark-400">
              Update your profile details and security preferences.
            </p>
          </div>
          <router-link
            to="/profile"
            class="inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            Go to Profile
          </router-link>
        </div>
      </template>
    </div>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import AppLayout from '@/components/layout/AppLayout.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'

const authStore = useAuthStore()
const user = computed(() => authStore.user)
const loading = ref(false)

const displayName = computed(() => user.value?.username || user.value?.email || '')
const balance = computed(() => (user.value?.balance ?? 0).toFixed(2))

const loadUser = async () => {
  loading.value = true
  try {
    await authStore.refreshUser()
  } catch (error) {
    console.error('Failed to load user:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadUser()
})
</script>
