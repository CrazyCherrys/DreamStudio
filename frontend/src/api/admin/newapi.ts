/**
 * Admin NewAPI Settings API endpoints
 * Handles DreamStudio image generation NewAPI configuration
 */

import { apiClient } from '../client'

export interface NewAPISettings {
  base_url: string
  access_key_configured: boolean
  default_model: string
}

export interface UpdateNewAPISettingsRequest {
  base_url?: string
  access_key?: string
  default_model?: string
}

export interface NewAPIModel {
  id: string
  name: string
}

export async function getSettings(): Promise<NewAPISettings> {
  const { data } = await apiClient.get<NewAPISettings>('/admin/newapi/settings')
  return data
}

export async function updateSettings(
  settings: UpdateNewAPISettingsRequest
): Promise<NewAPISettings> {
  const { data } = await apiClient.put<NewAPISettings>('/admin/newapi/settings', settings)
  return data
}

export async function getModels(): Promise<NewAPIModel[]> {
  const { data } = await apiClient.get<NewAPIModel[]>('/admin/newapi/models')
  return data
}

export default {
  getSettings,
  updateSettings,
  getModels
}
