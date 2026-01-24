import { apiClient } from './client'
import type { PaginatedResponse, VideoGenerationTask, VideoGenerationTaskDetail } from '@/types'

export interface VideoGeneratePayload {
  model_id: string
  prompt: string
  image?: string
  duration?: number
  width?: number
  height?: number
  fps?: number
  seed?: number
  count?: number
  async?: boolean
}

export interface VideoHistoryParams {
  page?: number
  page_size?: number
  status?: string
  model?: string
  start_time?: string
  end_time?: string
}

export async function createVideoTask(payload: VideoGeneratePayload): Promise<VideoGenerationTask> {
  const { data } = await apiClient.post<VideoGenerationTask>(
    '/videos/generate',
    { ...payload, async: true },
    { timeout: 120000 }
  )
  return data
}

export async function listVideoHistory(
  params: VideoHistoryParams = {}
): Promise<PaginatedResponse<VideoGenerationTask>> {
  const { data } = await apiClient.get<PaginatedResponse<VideoGenerationTask>>('/videos/history', {
    params
  })
  return data
}

export async function getVideoHistoryTask(id: number): Promise<VideoGenerationTaskDetail> {
  const { data } = await apiClient.get<VideoGenerationTaskDetail>(`/videos/history/${id}`)
  return data
}

export async function deleteVideoHistoryTask(id: number): Promise<{ message: string; warnings?: string[] }> {
  const { data } = await apiClient.delete<{ message: string; warnings?: string[] }>(`/videos/history/${id}`)
  return data
}

export default {
  createVideoTask,
  listVideoHistory,
  getVideoHistoryTask,
  deleteVideoHistoryTask
}
