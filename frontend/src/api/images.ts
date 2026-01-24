import { apiClient } from './client'
import type { ImageGenerationTask, ImageGenerationTaskDetail, PaginatedResponse } from '@/types'

export interface ImageGeneratePayload {
  model_id: string
  prompt: string
  resolution?: string
  aspect_ratio?: string
  reference_image?: string
  count?: number
  async?: boolean
}

export interface ImageHistoryParams {
  page?: number
  page_size?: number
  status?: string
  model?: string
  start_time?: string
  end_time?: string
}

export interface OptimizePromptPayload {
  prompt: string
}

export interface OptimizePromptResponse {
  prompt: string
}

export async function createImageTask(payload: ImageGeneratePayload): Promise<ImageGenerationTask> {
  const { data } = await apiClient.post<ImageGenerationTask>(
    '/images/generate',
    { ...payload, async: true },
    { timeout: 120000 }
  )
  return data
}

export async function listImageHistory(
  params: ImageHistoryParams = {}
): Promise<PaginatedResponse<ImageGenerationTask>> {
  const { data } = await apiClient.get<PaginatedResponse<ImageGenerationTask>>('/images/history', {
    params
  })
  return data
}

export async function getImageHistoryTask(id: number): Promise<ImageGenerationTaskDetail> {
  const { data } = await apiClient.get<ImageGenerationTaskDetail>(`/images/history/${id}`)
  return data
}

export async function deleteImageHistoryTask(id: number): Promise<{ message: string; warnings?: string[] }> {
  const { data } = await apiClient.delete<{ message: string; warnings?: string[] }>(`/images/history/${id}`)
  return data
}

export async function optimizePrompt(payload: OptimizePromptPayload): Promise<OptimizePromptResponse> {
  const { data } = await apiClient.post<OptimizePromptResponse>('/images/optimize', payload)
  return data
}

export default {
  createImageTask,
  listImageHistory,
  getImageHistoryTask,
  deleteImageHistoryTask,
  optimizePrompt
}
