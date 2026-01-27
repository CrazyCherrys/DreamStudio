import { apiClient } from '../client'
import type { GalleryImage, PaginatedResponse } from '@/types'

export interface GallerySubmissionListParams {
  page?: number
  page_size?: number
  status?: string
}

export async function listGallerySubmissions(
  params: GallerySubmissionListParams = {}
): Promise<PaginatedResponse<GalleryImage>> {
  const { data } = await apiClient.get<PaginatedResponse<GalleryImage>>(
    '/admin/gallery/submissions',
    { params }
  )
  return data
}

export async function updateGallerySubmissionStatus(
  id: number,
  status: 'approved' | 'rejected' | 'pending'
): Promise<GalleryImage> {
  const { data } = await apiClient.put<GalleryImage>(
    `/admin/gallery/submissions/${id}/status`,
    { status }
  )
  return data
}

export default {
  listGallerySubmissions,
  updateGallerySubmissionStatus
}
