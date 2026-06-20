export interface CreateImageTaskBody {
  model_record_id?: unknown;
  prompt?: unknown;
  negative_prompt?: unknown;
  parameters?: unknown;
  reference_asset_ids?: unknown;
  client_request_id?: unknown;
}

export interface ImageTaskListQuery {
  status?: unknown;
  page?: unknown;
  page_size?: unknown;
}

export type ImageTaskActionResponse = {
  item: PublicImageTask;
};

export interface PublicImageTask {
  id: string;
  model_record_id: string;
  model_id: string;
  endpoint_type: string;
  prompt_summary: string;
  negative_prompt_summary: string | null;
  sanitized_parameter_snapshot: unknown;
  reference_asset_ids: string[];
  status: string;
  error_code: string | null;
  error_message: string | null;
  client_request_id: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  result_assets: PublicTaskAsset[];
  attempts?: PublicTaskAttempt[];
}

export interface PublicTaskAsset {
  id: string;
  kind: string;
  filename: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  download_url: string;
  created_at: string;
}

export interface PublicTaskAttempt {
  id: string;
  attempt_no: number;
  status: string;
  started_at: string;
  finished_at: string | null;
  http_status: number | null;
  error_code: string | null;
  error_message: string | null;
  is_retryable: boolean;
  created_at: string;
}
