export interface AssetListQuery {
  kind?: unknown;
  page?: unknown;
  page_size?: unknown;
}

export interface BatchDeleteAssetsBody {
  asset_ids?: unknown;
}

export interface StorageSettingsBody {
  driver?: unknown;
  local_input_path?: unknown;
  local_output_path?: unknown;
  s3_endpoint?: unknown;
  s3_bucket?: unknown;
  s3_region?: unknown;
  s3_force_path_style?: unknown;
  s3_public_base_url?: unknown;
  s3_access_key?: unknown;
  s3_secret_key?: unknown;
  reference_retention_hours?: unknown;
  result_retention_hours?: unknown;
}
