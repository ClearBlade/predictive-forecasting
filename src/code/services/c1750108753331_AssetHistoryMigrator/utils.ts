import { AttrSchemaRt } from '@ia/common/misc/attributes';
import { rt } from '@ia/common/lib/runtypes';

type Attributes = rt.Static<typeof AttrSchemaRt>;

interface MQTTClientOptions {
  address: string;
  port: number;
  username: string;
  password: string;
  client_id: string;
  use_tls: boolean;
  tls_config: TLSConfig;
}

interface TLSConfig {
  client_cert: string;
  client_key: string;
  ca_cert: string;
}

interface MQTTMessage {
  payload: string;
  qos: number;
  retain: boolean;
  duplicate: boolean;
  user_properties?: Record<string, string>;
}

interface MQTTClientConstructor {
  new (options?: MQTTClientOptions): MQTTClient;
}

interface MQTTClient {
  disconnect: () => Promise<void>;
  subscribe(topic: string, onMessage: (topic: string, message: MQTTMessage) => void): Promise<unknown>;
  publish(topic: string, payload: string | MQTTMessage | Uint8Array, qos?: number, retain?: boolean): Promise<unknown>;
}

interface MQTTGlobal {
  Client: MQTTClientConstructor;
  Message: {
    new (payload: string): MQTTMessage;
    (payload: string): MQTTMessage;
  };
}

declare const MQTT: MQTTGlobal;

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

interface AssetHistoryRow {
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

// Local tracking of sync times during migration
export interface LocalSyncTracker {
  [assetId: string]: string; // assetId -> last sync timestamp
}

// Get all forecast pipelines
export const getPipelines = async (): Promise<PipelineData[]> => {
  const col = ClearBladeAsync.Collection<PipelineData>({
    collectionName: 'forecast_ml_pipelines',
  });
  const data = await col.fetch(ClearBladeAsync.Query());
  if (data.TOTAL === 0) return [];
  return data.DATA;
};

// Extract all asset IDs from all pipelines with their sync status
export const getAllAssetIds = (pipelines: PipelineData[]): AssetInfo[] => {
  const assetInfos: AssetInfo[] = [];

  for (const pipeline of pipelines) {
    for (const asset of pipeline.asset_management_data) {
      assetInfos.push({
        assetId: asset.id,
        pipelineId: pipeline.asset_type_id,
        last_bq_sync_time: asset.last_bq_sync_time || null,
      });
    }
  }

  return assetInfos;
};

// Create optimized query that filters rows at database level using JSONB operations
const createOptimizedQuery = (assetInfo: AssetInfo, pipeline: PipelineData, currentTime: Date) => {
  const forecastAttributes = getForecastAttributes(pipeline);
  const attributeNames = Array.from(forecastAttributes);

  let baseConditions = `asset_id = '${assetInfo.assetId}'`;

  if (assetInfo.last_bq_sync_time) {
    baseConditions += ` AND change_date > '${assetInfo.last_bq_sync_time}'`;
  }

  baseConditions += ` AND change_date < '${currentTime.toISOString()}'`;

  if (attributeNames.length > 0) {
    const attributeArray = `ARRAY[${attributeNames.map((name) => `'${name}'`).join(', ')}]`;
    baseConditions += ` AND changes->'custom_data' ?| ${attributeArray}`;

    baseConditions += ` AND NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(changes->'custom_data') AS key 
      WHERE key LIKE 'predicted_%'
    )`;
  }

  const rawQuery = `
    SELECT * FROM _asset_history 
    WHERE ${baseConditions}
    ORDER BY change_date ASC
  `;

  return ClearBladeAsync.Query().rawQuery(rawQuery);
};

// Get set of all forecast and supporting attribute names for a pipeline
const getForecastAttributes = (pipeline: PipelineData): Set<string> => {
  const forecastAttributes = new Set<string>();
  pipeline.attributes_to_predict.forEach((attr) => forecastAttributes.add(attr.attribute_name));
  pipeline.supporting_attributes.forEach((attr) => forecastAttributes.add(attr.attribute_name));
  return forecastAttributes;
};

// Publish a batch of asset history rows to MQTT
const publishBatchToMQTT = async (
  histRows: AssetHistoryRow[],
  pipeline: PipelineData,
  client: MQTTClient,
): Promise<void> => {
  try {
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 5;

    // Get set of forecast attribute names for efficient lookup
    const forecastAttributes = getForecastAttributes(pipeline);

    for (const histRow of histRows) {
      const topic = 'asset-history/raw';

      // Filter custom_data to only include forecast/supporting attributes and exclude predicted_ attributes
      const filteredCustomData = filterRelevantAttributes(histRow.changes.custom_data, forecastAttributes);

      // Skip if no relevant data post-filter
      if (Object.keys(filteredCustomData).length === 0) {
        continue;
      }

      // Create MQTT message with user properties for connector column mapping
      const message = new MQTT.Message(JSON.stringify(filteredCustomData));

      if (!message.user_properties) {
        message.user_properties = {};
      }

      message.user_properties['asset_type_id'] = pipeline.asset_type_id;
      message.user_properties['asset_id'] = histRow.asset_id;
      message.user_properties['change_date'] = histRow.change_date;

      try {
        await client.publish(topic, message);
        consecutiveFailures = 0; // Reset counter on success
      } catch (publishError) {
        consecutiveFailures++;
        console.error(
          `Failed to publish MQTT message for asset ${histRow.asset_id} at ${histRow.change_date} (failure ${consecutiveFailures}/${maxConsecutiveFailures}):`,
          publishError,
        );

        if (consecutiveFailures >= maxConsecutiveFailures) {
          throw new Error(
            `MQTT publishing failed ${maxConsecutiveFailures} times in a row. Aborting asset migration to prevent further issues.`,
          );
        }
      }
    }
  } catch (error) {
    console.error('Error publishing batch to MQTT:', error);
    throw error;
  }
};

// Filter custom_data to only include attributes that are configured for forecasting
const filterRelevantAttributes = (
  customData: Record<string, number | boolean>,
  forecastAttributes: Set<string>,
): Record<string, number | boolean> => {
  const filtered: Record<string, number | boolean> = {};

  for (const [key, value] of Object.entries(customData)) {
    // Exclude any predicted_ attributes (these shouldn't be in training data)
    if (key.startsWith('predicted_')) {
      continue;
    }

    // Include only attributes that are configured for forecasting
    if (forecastAttributes.has(key)) {
      filtered[key] = value;
    }
  }

  return filtered;
};

// Safely update sync times in forecast_ml_pipelines collection at the end of migration
export const updateSyncTimesInPipelines = async (localSyncTracker: LocalSyncTracker): Promise<void> => {
  if (Object.keys(localSyncTracker).length === 0) {
    return;
  }

  // Use lock to prevent race condition with ForecastManager
  const lock = ClearBladeAsync.Lock('forecast_ml_pipelines_update', 'AssetHistoryMigrator');

  try {
    await lock.lock();

    // Get fresh copy of all pipelines to prevent overwriting changes
    const freshPipelines = await getPipelines();
    const updatedPipelines: PipelineData[] = [];

    for (const pipeline of freshPipelines) {
      let pipelineUpdated = false;

      for (const asset of pipeline.asset_management_data) {
        if (localSyncTracker[asset.id]) {
          // Update the sync time for this asset
          asset.last_bq_sync_time = localSyncTracker[asset.id];
          pipelineUpdated = true;
        }
      }

      if (pipelineUpdated) {
        updatedPipelines.push(pipeline);
      }
    }

    // Batch update all modified pipelines
    if (updatedPipelines.length > 0) {
      const col = ClearBladeAsync.Collection<PipelineData>({
        collectionName: 'forecast_ml_pipelines',
      });

      const updatePromises = updatedPipelines.map((pipeline) => {
        return col.update(ClearBladeAsync.Query().equalTo('asset_type_id', pipeline.asset_type_id), pipeline);
      });

      await Promise.all(updatePromises);
    }
  } catch (error) {
    console.error('Error updating sync times in pipelines:', error);
    throw error;
  } finally {
    await lock.unlock();
  }
};

// Migrate asset history data in batches via MQTT
export const migrateAssetHistoryBatch = async (
  assetInfo: AssetInfo,
  pipeline: PipelineData,
  batchSize: number,
  sleepMs: number,
  startTime: Date,
  maxRuntimeMinutes: number,
  localSyncTracker: LocalSyncTracker,
): Promise<number> => {
  let batchesProcessed = 0;
  let mqttClient: MQTTClient | null = null;

  try {
    // Create MQTT client only once per asset migration
    mqttClient = new MQTT.Client();

    const col = ClearBladeAsync.Collection('_asset_history');

    // Use optimized query that filters at database level
    const baseQuery = createOptimizedQuery(assetInfo, pipeline, new Date());

    let pageNum = 0;
    let hasMoreData = true;
    let lastProcessedTimestamp: string | null = null;

    while (hasMoreData) {
      // Check runtime before processing each batch
      const runtimeMinutes = (new Date().getTime() - startTime.getTime()) / (1000 * 60);
      if (runtimeMinutes >= maxRuntimeMinutes) {
        console.log(`Reached runtime limit while processing asset ${assetInfo.assetId}, stopping`);
        break;
      }

      const paginatedQuery = baseQuery.setPage(batchSize, pageNum);
      const historyData = await col.fetch(paginatedQuery);

      if (historyData.DATA && historyData.DATA.length > 0) {
        const histRows = historyData.DATA as unknown as AssetHistoryRow[];

        await publishBatchToMQTT(histRows, pipeline, mqttClient);

        lastProcessedTimestamp = histRows[histRows.length - 1].change_date;

        batchesProcessed++;
        pageNum++;

        if (histRows.length < batchSize) {
          hasMoreData = false;
        }

        // Sleep between batches to avoid overwhelming MQTT
        if (sleepMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, sleepMs));
        }
      } else {
        hasMoreData = false;
      }
    }

    // Update local sync tracker if we processed any data
    if (lastProcessedTimestamp) {
      localSyncTracker[assetInfo.assetId] = lastProcessedTimestamp;
    }
  } catch (error) {
    console.error(`Error in migrateAssetHistoryBatch for asset ${assetInfo.assetId}:`, error);
    throw error;
  } finally {
    // Clean up MQTT client
    if (mqttClient && typeof (mqttClient as MQTTClient).disconnect === 'function') {
      try {
        await (mqttClient as MQTTClient).disconnect();
      } catch (disconnectError) {
        console.warn('Failed to disconnect MQTT client:', disconnectError);
      }
    }
  }

  return batchesProcessed;
};
