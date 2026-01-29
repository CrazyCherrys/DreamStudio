/**
 * User Usage API endpoints
 * Handles user usage statistics and dashboard data
 */

import { apiClient } from './client'

/**
 * User dashboard statistics
 */
export interface UserDashboardStats {
  /** Total API keys */
  total_api_keys: number
  /** Active API keys */
  active_api_keys: number
  /** Total requests made */
  total_requests: number
  /** Requests today */
  today_requests: number
  /** Total tokens used */
  total_tokens: number
  /** Total input tokens */
  total_input_tokens: number
  /** Total output tokens */
  total_output_tokens: number
  /** Tokens today */
  today_tokens: number
  /** Input tokens today */
  today_input_tokens: number
  /** Output tokens today */
  today_output_tokens: number
  /** Total cost (standard pricing) */
  total_cost: number
  /** Total actual cost (with discounts) */
  total_actual_cost: number
  /** Cost today (standard pricing) */
  today_cost: number
  /** Actual cost today (with discounts) */
  today_actual_cost: number
  /** Requests per minute */
  rpm: number
  /** Tokens per minute */
  tpm: number
  /** Average request duration in milliseconds */
  average_duration_ms: number
}

/**
 * Get current user's usage statistics
 * @returns User usage statistics
 */
export async function getUserUsageStats(): Promise<UserDashboardStats> {
  const { data } = await apiClient.get<UserDashboardStats>('/user/usage/stats')
  return data
}

export const usageAPI = {
  getUserUsageStats
}

export default usageAPI
