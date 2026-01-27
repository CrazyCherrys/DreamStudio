import { apiClient } from './client'
import type {
  PaginatedResponse,
  RedInkContentResult,
  RedInkOutlinePage,
  RedInkRecord,
  RedInkRecordDetail
} from '@/types'

export interface RedInkOutlineRequest {
  topic: string
  images?: string[]
  model_id?: string
  page_count?: number
}

export interface RedInkOutlineResponse {
  outline: string
  pages: RedInkOutlinePage[]
}

export interface RedInkContentRequest {
  topic: string
  outline: string
  model_id?: string
}

export interface RedInkRecordCreatePayload {
  topic: string
  outline_raw: string
  content?: RedInkContentResult
  pages: RedInkOutlinePage[]
  input_images?: string[]
  text_model_id?: string
  image_model_id?: string
  resolution?: string
  aspect_ratio?: string
}

export interface RedInkRecordUpdatePayload {
  outline_raw: string
  pages: RedInkOutlinePage[]
}

export interface RedInkRecordListParams {
  page?: number
  page_size?: number
  status?: string
  start_time?: string
  end_time?: string
}

export interface RedInkGenerationRequest {
  image_model_id?: string
  resolution?: string
  aspect_ratio?: string
}

export interface RedInkRetryRequest {
  page_ids?: number[]
}

export async function generateOutline(payload: RedInkOutlineRequest): Promise<RedInkOutlineResponse> {
  const { data } = await apiClient.post<RedInkOutlineResponse>('/redink/outline', payload)
  return data
}

export async function generateContent(payload: RedInkContentRequest): Promise<RedInkContentResult> {
  const { data } = await apiClient.post<RedInkContentResult>('/redink/content', payload)
  return data
}

export async function createRecord(payload: RedInkRecordCreatePayload): Promise<RedInkRecordDetail> {
  const { data } = await apiClient.post<RedInkRecordDetail>('/redink/records', payload)
  return data
}

export async function updateRecord(id: number, payload: RedInkRecordUpdatePayload): Promise<RedInkRecordDetail> {
  const { data } = await apiClient.put<RedInkRecordDetail>(`/redink/records/${id}`, payload)
  return data
}

export async function listRecords(
  params: RedInkRecordListParams = {}
): Promise<PaginatedResponse<RedInkRecord>> {
  const { data } = await apiClient.get<PaginatedResponse<RedInkRecord>>('/redink/records', {
    params
  })
  return data
}

export async function getRecord(id: number): Promise<RedInkRecordDetail> {
  const { data } = await apiClient.get<RedInkRecordDetail>(`/redink/records/${id}`)
  return data
}

export async function deleteRecord(id: number): Promise<{ message: string }> {
  const { data } = await apiClient.delete<{ message: string }>(`/redink/records/${id}`)
  return data
}

export async function startGeneration(
  id: number,
  payload: RedInkGenerationRequest = {}
): Promise<{ message: string }> {
  const { data } = await apiClient.post<{ message: string }>(
    `/redink/records/${id}/generate`,
    payload
  )
  return data
}

export async function retryPages(id: number, payload: RedInkRetryRequest = {}): Promise<{ message: string }> {
  const { data } = await apiClient.post<{ message: string }>(
    `/redink/records/${id}/retry`,
    payload
  )
  return data
}

export default {
  generateOutline,
  generateContent,
  createRecord,
  updateRecord,
  listRecords,
  getRecord,
  deleteRecord,
  startGeneration,
  retryPages
}
