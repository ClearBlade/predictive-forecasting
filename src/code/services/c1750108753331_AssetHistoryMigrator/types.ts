export const TIMER_TOPIC = "$timer/c1750108753331_AssetHistoryMigrator_Timer";
export const MAX_RUNTIME_MINUTES = 15; // 15 minutes max per cycle with 5-minute timer intervals
export const BATCH_SIZE = 1000;
export const SLEEP_BETWEEN_BATCHES_MS = 50;

export enum ATTR_DATA_TYPE {
  TEXT = "text",
  NUMBER = "number",
  IMAGE = "image",
  COLOR = "color",
  DATE_TIME = "dateTime",
  BOOLEAN = "boolean",
  URL = "url",
  DICTIONARY = "dictionary",
}

export enum ATTR_EDIT_WIDGET {
  INPUT = "input",
  TEXT_AREA = "textArea",
  PASSWORD = "password",
  NUMBER = "number",
  COLOR = "color",
  SLIDER = "slider",
  DATE_PICKER = "datePicker",
  TOGGLE = "toggle",
  CHECKBOX = "checkbox",
  TEXT_OPTIONS = "text_options",
  DICTIONARY_TEXT_INPUTS = "dictionaryTextInput",
}

export enum ATTR_VIEW_WIDGET {
  GAUGE = "gauge",
  HYPERLINK = "hyperlink",
  IMAGE = "image",
  LABEL = "label",
  COLOR = "color",
  TOGGLE = "toggle",
  DATE_PICKER = "datePicker",
  DATA_CARD = "dataCard",
  DICTIONARY_TABLE = "dictionaryLabel",
}

export interface Attributes {
  uuid: string;
  attribute_name: string;
  attribute_label?: string;
  attribute_type: ATTR_DATA_TYPE;
  attribute_edit_widget: ATTR_EDIT_WIDGET | string;
  custom_edit_settings?: Record<string, string | number | boolean>;
  attribute_view_widget: ATTR_VIEW_WIDGET | string;
  custom_view_settings?: Record<string, string | number | boolean>;
  keep_history: boolean;
  hide_attribute: boolean;
  readonly_attribute: boolean;
  expression?: object;
}

export interface MQTTClientOptions {
  address: string;
  port: number;
  username: string;
  password: string;
  client_id: string;
  use_tls: boolean;
  tls_config: TLSConfig;
}

export interface TLSConfig {
  client_cert: string;
  client_key: string;
  ca_cert: string;
}

export interface MQTTMessage {
  payload: string;
  qos: number;
  retain: boolean;
  duplicate: boolean;
  user_properties?: Record<string, string>;
}

export interface MQTTClientConstructor {
  new (options?: MQTTClientOptions): MQTTClient;
}

export interface MQTTClient {
  disconnect: () => Promise<void>;
  subscribe(
    topic: string,
    onMessage: (topic: string, message: MQTTMessage) => void,
  ): Promise<unknown>;
  publish(
    topic: string,
    payload: string | MQTTMessage | Uint8Array,
    qos?: number,
    retain?: boolean,
  ): Promise<unknown>;
}

export interface MQTTGlobal {
  Client: MQTTClientConstructor;
  Message: {
    new (payload: string): MQTTMessage;
    (payload: string): MQTTMessage;
  };
}

export interface AssetManagementData {
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
