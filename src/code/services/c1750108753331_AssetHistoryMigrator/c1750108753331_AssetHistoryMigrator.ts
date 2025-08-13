/**
 * Type: Stream Service
 * Description: A service to migrate asset history data from _asset_history collection to BigQuery via MQTT connectors.
 * Listens to timer topic and runs migration cycles every 5 minutes with 15-minute cleanup intervals.
 * @param {CbServer.BasicReq} req
 * @param {string} req.systemKey
 * @param {string} req.systemSecret
 * @param {string} req.userEmail
 * @param {string} req.userid
 * @param {string} req.userToken
 * @param {boolean} req.isLogging
 * @param {[id: string]} req.params
 * @param {CbServer.Resp} resp
 */

import {
  getPipelines,
  getAllAssetIds,
  migrateAssetHistoryBatch,
  updateSyncTimesInPipelines,
} from "./utils";
import { PipelineData, AssetInfo, LocalSyncTracker } from "./types";

const TIMER_TOPIC = "$timer/c1750108753331_AssetHistoryMigrator_Timer";
const MAX_RUNTIME_MINUTES = 15; // 15 minutes max per cycle with 5-minute timer intervals

function c1750108753331_AssetHistoryMigrator(
  _: CbServer.BasicReq,
  resp: CbServer.Resp,
) {
  console.log("Starting AssetHistoryMigrator stream service");

  const client = new MQTT.Client();
  let isProcessing = false; // Prevent overlapping cycles

  client
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .subscribe(
      TIMER_TOPIC,
      async function (_topic: string, _message: CbServer.MQTTMessage) {
        // Prevent overlapping processing cycles
        if (isProcessing) {
          return;
        }

        isProcessing = true;

        try {
          await runMigrationCycle();
        } catch (error) {
          console.error("Error in migration cycle:", error);
        } finally {
          isProcessing = false;
        }
      },
    )
    .catch(function (reason) {
      console.error("Failed to subscribe to timer topic:", reason);
      resp.error("Failed to subscribe to timer topic: " + reason.message);
    });
}

async function runMigrationCycle(): Promise<void> {
  const startTime = new Date();
  const localSyncTracker: LocalSyncTracker = {};

  try {
    const pipelines: PipelineData[] = await getPipelines();
    const allAssetIds = getAllAssetIds(pipelines);

    if (allAssetIds.length === 0) {
      return;
    }
    // Sort assets by last_bq_sync_time (most recent first, nulls last for new assets)
    // Mass migration should not disrupt established flows
    allAssetIds.sort((a: AssetInfo, b: AssetInfo) => {
      if (!a.last_bq_sync_time && !b.last_bq_sync_time) return 0;
      if (!a.last_bq_sync_time) return 1; // New assets go last
      if (!b.last_bq_sync_time) return -1;
      return (
        new Date(b.last_bq_sync_time).getTime() -
        new Date(a.last_bq_sync_time).getTime()
      );
    });

    // Process each asset with 15-minute timeout
    for (const assetInfo of allAssetIds) {
      const currentTime = new Date();
      const runtimeMinutes =
        (currentTime.getTime() - startTime.getTime()) / (1000 * 60);

      // Check if we're approaching the 15-minute limit
      if (runtimeMinutes >= MAX_RUNTIME_MINUTES) {
        console.log(
          `Reached ${MAX_RUNTIME_MINUTES} minute limit, stopping processing, will resume next cycle`,
        );
        break;
      }

      try {
        const pipeline = pipelines.find(
          (p) => p.asset_type_id === assetInfo.pipelineId,
        );
        if (!pipeline) {
          console.warn(`Pipeline not found for asset ${assetInfo.assetId}`);
          continue;
        }

        // Process asset history in batches
        await migrateAssetHistoryBatch(
          assetInfo,
          pipeline,
          startTime,
          MAX_RUNTIME_MINUTES,
          localSyncTracker,
        );
      } catch (error) {
        console.error(`Error processing asset ${assetInfo.assetId}:`, error);
      }
    }

    // Cleanup: Update sync times in forecast_ml_pipelines collection
    await updateSyncTimesInPipelines(localSyncTracker);
  } catch (error) {
    console.error("Error in migration cycle:", error);

    // Attempt to save sync times even if there was an error
    try {
      if (Object.keys(localSyncTracker).length > 0) {
        console.log("Attempting to save sync times despite error...");
        await updateSyncTimesInPipelines(localSyncTracker);
      }
    } catch (saveError) {
      console.error(
        "Failed to save sync times during error cleanup:",
        saveError,
      );
    }
  }
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
global.c1750108753331_AssetHistoryMigrator =
  c1750108753331_AssetHistoryMigrator;
