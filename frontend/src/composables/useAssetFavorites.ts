import { ref, watch } from 'vue'

const STORAGE_KEY = 'dreamstudio_favorites_v1'

export function useAssetFavorites() {
  const favorites = ref<Set<string>>(new Set())
  const canUseStorage = typeof localStorage !== 'undefined'

  // Initialize from localStorage
  let stored: string | null = null
  if (canUseStorage) {
    try {
      stored = localStorage.getItem(STORAGE_KEY)
    } catch (e) {
      console.warn('Failed to read favorites from storage', e)
    }
  }

  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        favorites.value = new Set(parsed)
      }
    } catch (e) {
      console.error('Failed to parse favorites', e)
    }
  }

  // Persist to localStorage
  watch(
    favorites,
    (newVal) => {
      if (!canUseStorage) return
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(newVal)))
      } catch (e) {
        console.warn('Failed to persist favorites', e)
      }
    },
    { deep: true }
  )

  const toggleFavorite = (key: string) => {
    if (favorites.value.has(key)) {
      favorites.value.delete(key)
    } else {
      favorites.value.add(key)
    }
    // Trigger reactivity
    favorites.value = new Set(favorites.value)
  }

  const isFavorited = (key: string) => {
    return favorites.value.has(key)
  }

  return { favorites, toggleFavorite, isFavorited }
}
