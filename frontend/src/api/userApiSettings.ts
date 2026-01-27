/**
 * User API Settings endpoints
 * Manages user-provided API key for NewAPI requests
 */

import { apiClient } from './client'

export interface UserApiSettingsResponse {
  custom_key_configured: boolean
}

export async function getUserApiSettings(): Promise<UserApiSettingsResponse> {
  const { data } = await apiClient.get<UserApiSettingsResponse>('/user/api-settings')
  return data
}

export async function updateUserApiSettings(customKey: string): Promise<UserApiSettingsResponse> {
  const { data } = await apiClient.put<UserApiSettingsResponse>('/user/api-settings', {
    custom_key: customKey
  })
  return data
}

export default {
  getUserApiSettings,
  updateUserApiSettings
}
