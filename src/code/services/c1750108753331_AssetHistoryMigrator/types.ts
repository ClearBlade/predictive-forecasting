import { AssetType } from '@clearblade/ia-mfe-core';

type Attributes = AssetType['frontend']['schema'][number];

interface MQTTMessage {
  payload: string;
  qos: number;
  retain: boolean;
  duplicate: boolean;
  user_properties?: Record<string, string>; // This is where the asset_type_id, asset_id, and change_date are stored
}

export interface MQTTGlobal {
  Client: CbServer.MQTTClientConstructor;
  Message: {
    new (payload: string): MQTTMessage;
    (payload: string): MQTTMessage;
  };
}

interface AssetManagementData {
  id: string; // the asset id that forecasting will be set up for
  next_inference_time?: string | null; // the next time inference should be run
  last_inference_time?: string | null; // the last time inference was run
  next_train_time?: string | null; // the next time training should be run
  last_train_time?: string | null; // the last time training was run
  asset_model?: string | null; // the gsutil path to this asset's forecast model
  last_bq_sync_time?: string | null; // the last time data was synced to BigQuery
}

export interface PipelineData {
  asset_type_id: string; // the asset type id that forecasting will be set up for
  attributes_to_predict: Attributes[]; // list of attributes that will receive forecasts and are used as features in the model
  supporting_attributes: Attributes[]; // list of attributes that used as features in the model but do not receive forecasts
  asset_management_data: AssetManagementData[]; // list of assets that will receive forecasts
  forecast_refresh_rate: number; // how often inference should be run to generate forecasts
  retrain_frequency: number; // how often training should be run to update the model
  forecast_length: number; // the duration of the forecast in days
  timestep: number; // the time step of the data in minutes
  forecast_start_date: string; // the date when inference should first start
  latest_settings_update: string; // the last time these settings were updated
}

export interface AssetHistoryRow {
  item_id?: string;
  asset_id: string;
  change_date: string;
  changes: { custom_data: Record<string, number | boolean> };
}

export interface AssetInfo {
  assetId: string;
  pipelineId: string;
  last_bq_sync_time?: string | null;
}

export interface LocalSyncTracker {
  [assetId: string]: string; // assetId -> last sync timestamp
}
