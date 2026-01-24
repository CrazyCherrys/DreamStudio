import { apiClient } from './client'
import type { GalleryImage, PaginatedResponse } from '@/types'

export interface GalleryListParams {
  page?: number
  page_size?: number
}

export interface SubmitGalleryRequest {
  image_url: string
}

export interface UpdateGalleryVisibilityRequest {
  is_public: boolean
}

export async function listPublicGallery(
  params: GalleryListParams = {}
): Promise<PaginatedResponse<GalleryImage>> {
  const { data } = await apiClient.get<PaginatedResponse<GalleryImage>>('/gallery', { params })
  return data
}

export async function listUserGallery(
  params: GalleryListParams = {}
): Promise<PaginatedResponse<GalleryImage>> {
  const { data } = await apiClient.get<PaginatedResponse<GalleryImage>>('/gallery/mine', { params })
  return data
}

export async function submitGalleryImage(payload: SubmitGalleryRequest): Promise<GalleryImage> {
  const { data } = await apiClient.post<GalleryImage>('/gallery/submit', payload)
  return data
}

export async function updateGalleryVisibility(
  id: number,
  payload: UpdateGalleryVisibilityRequest
): Promise<{ message: string }> {
  const { data } = await apiClient.patch<{ message: string }>(`/gallery/${id}/visibility`, payload)
  return data
}

export async function withdrawGallerySubmission(id: number): Promise<GalleryImage> {
  const { data } = await apiClient.delete<GalleryImage>(`/gallery/${id}/submission`)
  return data
}

export default {
  listPublicGallery,
  listUserGallery,
  submitGalleryImage,
  updateGalleryVisibility,
  withdrawGallerySubmission
}
