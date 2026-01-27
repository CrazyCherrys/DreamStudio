/**
 * API Client for Sub2API Backend
 * Central export point for all API modules
 */

// Re-export the HTTP client
export { apiClient } from './client'

// Auth API
export { authAPI } from './auth'

// User APIs
export { userAPI } from './user'
export { default as userApiSettingsAPI } from './userApiSettings'
export { default as modelSettingsAPI } from './modelSettings'
export { default as imagesAPI } from './images'
export { default as videosAPI } from './videos'
export { default as redinkAPI } from './redink'

// Admin APIs
export { adminAPI } from './admin'

// Default export
export { default } from './client'
