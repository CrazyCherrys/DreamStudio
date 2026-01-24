/**
 * User Model Settings API
 * Stores per-model endpoint, resolution, and aspect ratio preferences
 */

import { apiClient } from './client'

export type RequestEndpoint = 'openai' | 'gemini' | 'openai_mod'
export type ModelType = 'image' | 'video'

export interface UserModelSetting {
  model_id: string
  resolutions: string[]
  aspect_ratios: string[]
  request_endpoint?: RequestEndpoint
  model_type?: ModelType
  display_name?: string
}

export interface UserModelSettingsResponse {
  items: UserModelSetting[]
}

export interface NewAPIModel {
  id: string
  name: string
}

export async function getUserModelSettings(): Promise<UserModelSettingsResponse> {
  const { data } = await apiClient.get<UserModelSettingsResponse>('/user/model-settings')
  return data
}

export async function updateUserModelSettings(
  payload: UserModelSettingsResponse
): Promise<UserModelSettingsResponse> {
  const { data } = await apiClient.put<UserModelSettingsResponse>('/user/model-settings', payload)
  return data
}

export async function getUserNewAPIModels(): Promise<NewAPIModel[]> {
  const { data } = await apiClient.get<NewAPIModel[]>('/user/newapi/models')
  return data
}

export default {
  getUserModelSettings,
  updateUserModelSettings,
  getUserNewAPIModels
}
