import {
  MQTTGlobal,
  PipelineData,
  AssetHistoryRow,
  AssetInfo,
  LocalSyncTracker,
} from "./types";

declare const MQTT: MQTTGlobal;
const BATCH_SIZE = 1000;
const SLEEP_BETWEEN_BATCHES_MS = 50;

// Get all forecast pipelines
export const getPipelines = async (): Promise<PipelineData[]> => {
  const col = ClearBladeAsync.Collection<PipelineData>({
    collectionName: "forecast_ml_pipelines",
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

// Create optimized query that filters rows at database level using native ClearBlade queries
const createOptimizedQuery = (assetInfo: AssetInfo, currentTime: Date) => {
  let query = ClearBladeAsync.Query().equalTo("asset_id", assetInfo.assetId);

  // Add time-based filtering
  if (assetInfo.last_bq_sync_time) {
    const lastSyncTime = new Date(assetInfo.last_bq_sync_time);
    if (lastSyncTime >= currentTime) {
      // Return empty query if last sync is in future
      query = query.equalTo(
        "asset_id",
        "impossible_asset_id_that_will_return_nothing",
      );
    } else {
      query = query.greaterThan("change_date", assetInfo.last_bq_sync_time);
    }
  }

  // Add current time cutoff
  query = query.lessThan("change_date", currentTime.toISOString());

  return query;
};

// Get set of all forecast and supporting attribute names for a pipeline
const getForecastAttributes = (pipeline: PipelineData): Set<string> => {
  const forecastAttributes = new Set<string>();
  pipeline.attributes_to_predict.forEach((attr) =>
    forecastAttributes.add(attr.attribute_name),
  );
  pipeline.supporting_attributes.forEach((attr) =>
    forecastAttributes.add(attr.attribute_name),
  );
  return forecastAttributes;
};

// Publish a batch of asset history rows to MQTT
const publishBatchToMQTT = async (
  histRows: AssetHistoryRow[],
  pipeline: PipelineData,
  client: CbServer.MQTTClient,
): Promise<void> => {
  try {
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 5;

    // Get set of forecast attribute names for efficient lookup
    const forecastAttributes = getForecastAttributes(pipeline);

    for (const histRow of histRows) {
      const topic = "asset-history/raw";

      // Filter custom_data to only include forecast/supporting attributes and exclude predicted_ attributes
      const filteredCustomData = filterRelevantAttributes(
        histRow.changes.custom_data,
        forecastAttributes,
      );

      // Skip if no relevant data post-filter
      if (Object.keys(filteredCustomData).length === 0) {
        continue;
      }

      // Create MQTT message with user properties for connector column mapping
      const message = new MQTT.Message(JSON.stringify(filteredCustomData));

      if (!message.user_properties) {
        message.user_properties = {};
      }

      message.user_properties["asset_type_id"] = pipeline.asset_type_id;
      message.user_properties["asset_id"] = histRow.asset_id;
      message.user_properties["change_date"] = histRow.change_date;

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
    console.error("Error publishing batch to MQTT:", error);
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
    if (key.startsWith("predicted_")) {
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
export const updateSyncTimesInPipelines = async (
  localSyncTracker: LocalSyncTracker,
): Promise<void> => {
  if (Object.keys(localSyncTracker).length === 0) {
    return;
  }

  // Use lock to prevent race condition with ForecastManager
  const lock = ClearBladeAsync.Lock(
    "forecast_ml_pipelines_update",
    "AssetHistoryMigrator",
  );

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
        collectionName: "forecast_ml_pipelines",
      });

      const updatePromises = updatedPipelines.map((pipeline) => {
        return col.update(
          ClearBladeAsync.Query().equalTo(
            "asset_type_id",
            pipeline.asset_type_id,
          ),
          pipeline,
        );
      });

      await Promise.all(updatePromises);
    }
  } catch (error) {
    console.error("Error updating sync times in pipelines:", error);
    throw error;
  } finally {
    await lock.unlock();
  }
};

// Migrate asset history data in batches via MQTT
export const migrateAssetHistoryBatch = async (
  assetInfo: AssetInfo,
  pipeline: PipelineData,
  startTime: Date,
  maxRuntimeMinutes: number,
  localSyncTracker: LocalSyncTracker,
): Promise<number> => {
  const currentTime = new Date();
  if (assetInfo.last_bq_sync_time) {
    const lastSyncTime = new Date(assetInfo.last_bq_sync_time);
    if (lastSyncTime >= currentTime) {
      return 0;
    }
  }

  let batchesProcessed = 0;
  let mqttClient: CbServer.MQTTClient | null = null;

  try {
    // Create MQTT client only once per asset migration
    mqttClient = new MQTT.Client();

    const col = ClearBladeAsync.Collection("_asset_history");

    // Use optimized query that filters at database level
    const baseQuery = createOptimizedQuery(assetInfo, new Date());

    let pageNum = 1;
    let hasMoreData = true;
    let lastProcessedTimestamp: string | null = null;

    while (hasMoreData) {
      // Check runtime before processing each batch
      const runtimeMinutes =
        (new Date().getTime() - startTime.getTime()) / (1000 * 60);
      if (runtimeMinutes >= maxRuntimeMinutes) {
        //will break with hasMoreData still true
        break;
      }

      const paginatedQuery = baseQuery.setPage(BATCH_SIZE, pageNum);
      const historyData = await col.fetch(paginatedQuery);

      if (historyData.DATA && historyData.DATA.length > 0) {
        let histRows = historyData.DATA as unknown as AssetHistoryRow[];

        // Application-level filtering since native queries can't handle complex JSONB operations
        const forecastAttributes = getForecastAttributes(pipeline);

        // Filter for rows that have forecast attributes and don't have predicted attributes
        histRows = histRows.filter((row) => {
          if (!row.changes?.custom_data) return false;

          const customDataKeys = Object.keys(row.changes.custom_data);

          // Skip rows with predicted attributes
          if (customDataKeys.some((key) => key.startsWith("predicted_"))) {
            return false;
          }

          // Only include rows that have at least one forecast attribute
          return customDataKeys.some((key) => forecastAttributes.has(key));
        });

        if (histRows.length === 0) {
          pageNum++;
          continue;
        }

        await publishBatchToMQTT(histRows, pipeline, mqttClient);

        if (histRows.length > 0) {
          lastProcessedTimestamp = histRows[histRows.length - 1].change_date;
        }

        batchesProcessed++;
        pageNum++;

        // Sleep between batches to avoid overwhelming MQTT
        await new Promise((resolve) =>
          setTimeout(resolve, SLEEP_BETWEEN_BATCHES_MS),
        );
      } else {
        hasMoreData = false;
      }
    }
    if (!hasMoreData && pageNum > 2) {
      console.log(
        "Mass Migration Complete for asset: ",
        assetInfo.assetId,
        "In: ",
        (new Date().getTime() - startTime.getTime()) / (1000 * 60),
        "minutes",
      );
      lastProcessedTimestamp = await getLastTimestamp(assetInfo.assetId);
      if (
        lastProcessedTimestamp &&
        new Date(lastProcessedTimestamp) >= currentTime
      ) {
        lastProcessedTimestamp = currentTime.toISOString();
      }
      console.log(
        "Initializing lastBQSyncTime to: ",
        lastProcessedTimestamp,
        "for asset: ",
        assetInfo.assetId,
      );
    }

    // Update local sync tracker if we processed any data
    if (lastProcessedTimestamp) {
      localSyncTracker[assetInfo.assetId] = lastProcessedTimestamp;
    }
  } catch (error) {
    console.error(
      `Error in migrateAssetHistoryBatch for asset ${assetInfo.assetId}:`,
      error,
    );
    throw error;
  }
  return batchesProcessed;
};

const getLastTimestamp = async (assetId: string): Promise<string | null> => {
  try {
    const col = ClearBladeAsync.Collection("_asset_history");
    const query = ClearBladeAsync.Query()
      .equalTo("asset_id", assetId)
      .setPage(0, 1)
      .descending("change_date");

    const data = await col.fetch(query);
    return data.TOTAL > 0
      ? (data.DATA[0] as AssetHistoryRow).change_date
      : null;
  } catch (error) {
    console.error("Error getting last timestamp:", error);
    return null;
  }
};
