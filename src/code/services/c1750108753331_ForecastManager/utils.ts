import { AssetHistory } from '@ia/common/collection-types/asset_history';
import { Attributes } from '@ia/common/collection-types/components';

const PROJECT_ID = 'clearblade-ipm';
const DATASET_ID = 'clearblade_components';
const TABLE_ID = cbmeta.system_key;
const SCRIPT_PATH = 'gs://clearblade-predictive-forecasting/forecast-script/SageFormer_IoT_Forecasting.py';
const LOCATION = 'us-central1';
const VERTEX_AI_ENDPOINT = `https://${LOCATION}-aiplatform.googleapis.com/v1`;
//was TEMPLATE_URI before
const TRAINING_TEMPLATE_URI =
  'https://us-central1-kfp.pkg.dev/clearblade-ipm/cb-ml-pipelines/forecast-train-pipeline-template/sha256:sha256:1efcea3d02fe03a4fb0c3fca53fac07defb5a28a3815770189fab4f068865ac5';
const INFERENCE_TEMPLATE_URI =
  'https://us-central1-kfp.pkg.dev/clearblade-ipm/cb-ml-pipelines/forecast-inference-pipeline-template/sha256:970dd968af79c09c64a14233783f3fb37adb5b03c726622459919a01fbfda206';
const OUTPUT_DIRECTORY = 'gs://clearblade-predictive-forecasting';

interface AssetManagementData {
  id: string; //the asset id that forecasting will be set up for
  next_inference_time?: string; //the next time inference should be run
  last_inference_time?: string; //the last time inference was run
  next_train_time?: string; //the next time training should be run
  last_train_time?: string; //the last time training was run
  asset_model?: string; //the gsutil path to this asset's forecast model
}

export interface PipelineData {
  asset_type_id: string; //the asset type id that forecasting will be set up for
  attributes_to_predict: Attributes[]; //list of attributes that will receive forecasts and are used as features in the model
  supporting_attributes: Attributes[]; //list of attributes that used as features in the model but do not receive forecasts
  asset_management_data: AssetManagementData[]; //list of assets that will receive forecasts
  forecast_refresh_rate: number; //how often inference should be run to generate forecasts
  retrain_frequency: number; //how often training should be run to update the model
  forecast_length: number; //the duration of the forecast in days
  timestep: number; //the time step of the data in minutes
  forecast_start_date: string; //the date when inference should first start
  latest_settings_update: string; //the last time these settings were updated
}

export interface AssetHistoryRow {
  asset_id: string;
  change_date: string;
  changes: { custom_data: Record<string, number | boolean> };
}

// old AssetHistoryRow
// export interface AssetHistoryRow {
//   asset_id: string;
//   change_date: string;
//   data: Record<string, number | boolean>;
// }

export const getPipelines = async (): Promise<PipelineData[]> => {
  const col = ClearBladeAsync.Collection<PipelineData>({
    collectionName: 'forecast_ml_pipelines',
  });
  const data = await col.fetch(ClearBladeAsync.Query());
  if (data.TOTAL === 0) return [];
  return data.DATA;
};

//this will need to change, take in an assetId, and timeStep (timeStep is in units of minutes).
//query the _asset_history collection which has asset_id column and change_date column (which is a format like 06/25/25 10:07:36)
//You need to find the oldest change_date for the assetId.
//if this date is older than (5*timeStep*672)+(timeStep*96) minutes in the past from current time, then return true, otherwise, return false
export const isThresholdMet = async (assetId: string, timeStep: number): Promise<boolean> => {
  try {
    const col = ClearBladeAsync.Collection('_asset_history');
    const query = ClearBladeAsync.Query().equalTo('asset_id', assetId).setPage(0, 1).ascending('change_date');

    const data = await col.fetch(query);

    if (data.TOTAL === 0) {
      return false;
    }

    const oldestRecord = data.DATA[0] as AssetHistory['frontend']; //TODO:need to define this any
    const oldestDate = new Date(oldestRecord.change_date);
    const currentTime = new Date();

    // Calculate required threshold: (5*timeStep*672)+(timeStep*96) minutes
    const thresholdMinutes = 5 * timeStep * 672 + timeStep * 96;
    const thresholdTime = new Date(currentTime.getTime() - thresholdMinutes * 60 * 1000);

    return oldestDate < thresholdTime;
  } catch (error) {
    console.error('Error checking threshold:', error);
    return false;
  }
};

//change to shouldRunTrainingPipeline, act for each asset in asset_management_data
//if current time is greater than next_train_time, then return true, otherwise return false
export const shouldRunTrainingPipeline = (asset: AssetManagementData): boolean => {
  if (!asset.next_train_time) {
    return false;
  }

  const currentTime = new Date();
  const nextTrainTime = new Date(asset.next_train_time);

  return currentTime > nextTrainTime;
};

//make a separate function for shouldRunInferencePipeline, act for each asset in asset_management_data
//if current time is greater than next_inference_time and asset_model is not null, then return true, otherwise return false
export const shouldRunInferencePipeline = (asset: AssetManagementData): boolean => {
  if (!asset.next_inference_time || !asset.asset_model) {
    return false;
  }

  const currentTime = new Date();
  const nextInferenceTime = new Date(asset.next_inference_time);

  return currentTime > nextInferenceTime;
};

//this will need to be updated, one function for both train and inference as the query will be the same for both
//query example: SELECT date_time, asset_type_id, asset_id, data  FROM `PROJECT_ID.DATASET_ID.TABLE_ID`  WHERE asset_id = assetId AND asset_type_id = assetTypeId ORDER BY date_time
export const constructDataQuery = (assetId: string, assetTypeId: string): string => {
  // Escape single quotes to prevent SQL injection
  const escapedAssetId = assetId.replace(/'/g, "''");
  const escapedAssetTypeId = assetTypeId.replace(/'/g, "''");

  const query = `
    SELECT date_time, asset_type_id, asset_id, data
    FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
    WHERE asset_id = '${escapedAssetId}'
      AND asset_type_id = '${escapedAssetTypeId}'
    ORDER BY date_time`;

  return query;
};

//break this into two functions, one for training and one for inference
//display name will be forecast-train-pipeline-job-${TABLE_ID}-${row.asset_type_id}-${row.asset_id}
//display name will be forecast-inference-pipeline-job-${TABLE_ID}-${row.asset_type_id}-${row.asset_id}
//we can assume all features in data column are features for the model so we don't need to specify them
export const startTrainingPipeline = async (
  pipelineData: PipelineData,
  asset: AssetManagementData,
): Promise<{ error: boolean; message: string }> => {
  const response: { error: boolean; message: string } = {
    error: true,
    message: '',
  };

  try {
    const allSubscriptions = await AccessTokenCache()
      .getAll()
      .catch((err) => Promise.reject({ error: true, message: err }));
    const bigQueryToken = allSubscriptions['google-bigquery-config'].accessToken;

    if (!bigQueryToken) {
      throw new Error("BigQuery Token is undefined or empty. Please check the subscription 'google-bigquery-config'.");
    }
    //timestamp is new Date().toISOString().replace(/[-:Z]/g, '') but we need to remove everything after the first '.' including the '.' and remove the 'T' then remove the last 3 characters
    const timestamp = new Date().toISOString().replace(/[-:Z]/g, '').replace(/\./g, '').replace('T', '').slice(0, -3);
    const pipelineConfig = {
      displayName: `forecast-train-pipeline-job-${TABLE_ID}-${pipelineData.asset_type_id}-${asset.id}`,
      runtimeConfig: {
        gcsOutputDirectory: OUTPUT_DIRECTORY + `/${cbmeta.system_key}/ia-forecasting/outbox/models`,
        parameterValues: {
          bq_query: `SELECT date_time, asset_type_id, asset_id, data  FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`  WHERE asset_id = '${asset.id}' AND asset_type_id = '${pipelineData.asset_type_id}' ORDER BY date_time`,
          gcp_project_id: PROJECT_ID,
          model_id: asset.id + '_' + timestamp,
          system_key: cbmeta.system_key,
          sageformer_timestep: pipelineData.timestep.toString(),
          script_gcs_path: SCRIPT_PATH,
        },
      },
      serviceAccount: 'bigqueryadmin@clearblade-ipm.iam.gserviceaccount.com',
      templateUri: TRAINING_TEMPLATE_URI,
    };

    const pipelineResponse = await fetch(
      `${VERTEX_AI_ENDPOINT}/projects/${PROJECT_ID}/locations/${LOCATION}/pipelineJobs`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bigQueryToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pipelineConfig),
      },
    );

    if (!pipelineResponse.ok) {
      const errorText = pipelineResponse.text();
      throw new Error(`Error in creating training pipeline job: ${errorText}`);
    }

    const pipelineResult = (await pipelineResponse.json()) as {
      name: string;
      [key: string]: string | object;
    };

    response.error = false;
    response.message = `Training pipeline created successfully. Pipeline Job ID: ${pipelineResult.name}`;
    return response;
  } catch (error) {
    response.message = error + JSON.stringify(error);
    console.error('Error:', error);
    return response;
  }
};

export const startInferencePipeline = async (
  pipelineData: PipelineData,
  asset: AssetManagementData,
): Promise<{ error: boolean; message: string }> => {
  const response: { error: boolean; message: string } = {
    error: true,
    message: '',
  };

  try {
    const allSubscriptions = await AccessTokenCache()
      .getAll()
      .catch((err) => Promise.reject({ error: true, message: err }));
    const bigQueryToken = allSubscriptions['google-bigquery-config'].accessToken;

    if (!bigQueryToken) {
      throw new Error("BigQuery Token is undefined or empty. Please check the subscription 'google-bigquery-config'.");
    }
    const timestamp = new Date().toISOString().replace(/[-:Z]/g, '').replace(/\./g, '').replace('T', '').slice(0, -3);
    const pipelineConfig = {
      displayName: `forecast-inference-pipeline-job-${TABLE_ID}-${pipelineData.asset_type_id}-${asset.id}`,
      runtimeConfig: {
        gcsOutputDirectory: OUTPUT_DIRECTORY + `/${cbmeta.system_key}/ia-forecasting/outbox/forecasts`,
        parameterValues: {
          bq_query: `SELECT date_time, asset_type_id, asset_id, data  FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`  WHERE asset_id = '${asset.id}' AND asset_type_id = '${pipelineData.asset_type_id}' ORDER BY date_time`,
          gcp_project_id: PROJECT_ID,
          model_id: asset.id + '_' + timestamp,
          model_gcs_path: asset.asset_model,
          script_gcs_path: SCRIPT_PATH,
        },
      },
      serviceAccount: 'bigqueryadmin@clearblade-ipm.iam.gserviceaccount.com',
      templateUri: INFERENCE_TEMPLATE_URI,
    };

    const pipelineResponse = await fetch(
      `${VERTEX_AI_ENDPOINT}/projects/${PROJECT_ID}/locations/${LOCATION}/pipelineJobs`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bigQueryToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(pipelineConfig),
      },
    );

    if (!pipelineResponse.ok) {
      const errorText = await pipelineResponse.text();
      throw new Error(`Error in creating inference pipeline job: ${errorText}`);
    }

    const pipelineResult = (await pipelineResponse.json()) as {
      name: string;
      [key: string]: string | object;
    };

    response.error = false;
    response.message = `Inference pipeline created successfully. Pipeline Job ID: ${pipelineResult.name}`;
    return response;
  } catch (error) {
    response.message = error + JSON.stringify(error);
    console.error('Error:', error);
    return response;
  }
};

export const killPipeline = async (pipelineRunId: string): Promise<{ error: boolean; message: string }> => {
  const response: { error: boolean; message: string } = {
    error: true,
    message: '',
  };
  if (!pipelineRunId) {
    response.error = false;
    response.message = 'No existing Pipeline to delete.';
    return response;
  }
  try {
    const allSubscriptions = await AccessTokenCache()
      .getAll()
      .catch((err) => Promise.reject({ error: true, message: err }));
    const bigQueryToken = allSubscriptions['google-bigquery-config'].accessToken;

    if (!bigQueryToken) {
      throw new Error("BigQuery Token is undefined or empty. Please check the subscription 'google-bigquery-config'.");
    }

    const killResponse = await fetch(
      `${VERTEX_AI_ENDPOINT}/projects/${PROJECT_ID}/locations/${LOCATION}/pipelineJobs/${pipelineRunId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${bigQueryToken}`,
        },
      },
    );

    if (!killResponse.ok) {
      const errorText = killResponse.text();
      if (Number(JSON.parse(errorText).error.code) === 404) {
        //if the pipeline job doesn't exist, then there is no need to delete it so we can treat it as a success
        response.error = false;
        response.message = 'No existing Pipeline Job to delete.';
        return response;
      }
      throw new Error(`Error in deleting Pipeline Job: ${errorText}`);
    }

    response.error = false;
    response.message = 'Pipeline deleted successfully';
    return response;
  } catch (error) {
    response.message = error + JSON.stringify(error);
    console.error('Error:', error);
    return response;
  }
};

//this will be for updating the pipeline rows in the forecast_ml_pipelines collection
//specifically in the asset_management_data to update last_train_time, next_train_time, last_inference_time, and next_inference_time, and asset_model
export const updatePipelineRows = async (rows: PipelineData[]): Promise<void> => {
  const col = ClearBladeAsync.Collection({
    collectionName: 'forecast_ml_pipelines',
  });
  const promises = rows.map((row) => {
    return col.update(ClearBladeAsync.Query().equalTo('asset_type_id', row.asset_type_id), row);
  });
  await Promise.all(promises);
};

export const deletePipelineRow = async (assetTypeId: string): Promise<void> => {
  const col = ClearBladeAsync.Collection({
    collectionName: 'forecast_ml_pipelines',
  });
  await col.remove(ClearBladeAsync.Query().equalTo('asset_type_id', assetTypeId));
};

export interface SubscriptionConfig {
  CB_FORWARD_TOPIC: string;
  FORWARD_TO_CB_TOPIC: boolean;
  accessToken: string;
  maxMessages: number;
  pullUrl: string;
  ackUrl: string;
  subscriptionType: string;
}

const cacheName = 'AccessTokenCache';

const AccessTokenCache = (asyncClient = ClearBladeAsync) => {
  const cache = asyncClient.Cache<SubscriptionConfig>(cacheName);

  return {
    getAll: () => cache.getAll(),
    set: (subscriptionID: string, data: SubscriptionConfig) => cache.set(subscriptionID, data),
  };
};

interface BQDataSchema {
  date_time: string;
  asset_type_id: string;
  asset_id: string;
  data: Record<string, number>;
}

interface BQRow {
  json: { date_time: string; asset_type_id: string; asset_id: string; data: Record<string, number> };
}

/**
 * Adds bulk data to BigQuery using insertAll with intelligent batching based on data size
 * @param {BQDataSchema[]} dataArray - Array of data objects to insert
 * @returns {Promise<BQDataSchema[]>} - Promise that resolves with the original data array
 */
export const addBulkDataToBQ = async (dataArray: BQDataSchema[]): Promise<BQDataSchema[]> => {
  if (dataArray.length === 0) {
    return dataArray;
  }

  const externalDB = ClearBladeAsync.Database({
    externalDBName: 'IAComponentsBQDB',
  });

  // Estimate size of first row to determine batch size
  const firstRowBQ: BQRow = {
    json: {
      date_time: dataArray[0].date_time,
      asset_type_id: dataArray[0].asset_type_id,
      asset_id: dataArray[0].asset_id,
      data: dataArray[0].data,
    },
  };

  const firstRowSizeBytes = JSON.stringify(firstRowBQ).length;
  const firstRowSizeKB = Math.ceil(firstRowSizeBytes / 100) / 10; // Round up to nearest 0.1 KB

  console.log(`Estimated row size: ${firstRowSizeKB} KB`);

  // Calculate how many rows fit in ~500KB batches
  const targetBatchSizeKB = 500;
  const rowsPerBatch = Math.floor(targetBatchSizeKB / firstRowSizeKB);
  const actualRowsPerBatch = Math.max(1, rowsPerBatch); // Ensure at least 1 row per batch

  console.log(
    `Processing ${dataArray.length} rows in batches of ${actualRowsPerBatch} rows (~${(
      actualRowsPerBatch * firstRowSizeKB
    ).toFixed(1)} KB per batch)`,
  );

  // Create batches
  const batches: BQDataSchema[][] = [];
  for (let i = 0; i < dataArray.length; i += actualRowsPerBatch) {
    batches.push(dataArray.slice(i, i + actualRowsPerBatch));
  }

  // Process batches sequentially
  try {
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];

      const rows: BQRow[] = batch.map((data) => ({
        json: {
          date_time: data.date_time,
          asset_type_id: data.asset_type_id,
          asset_id: data.asset_id,
          data: data.data,
        },
      }));

      await externalDB.performOperation('insertAll', {
        dataset: 'clearblade_components',
        table: cbmeta.system_key,
        rows: rows,
      });

      console.log(`Completed batch ${batchIndex + 1}/${batches.length} (${batch.length} rows)`);
    }

    console.log(`Successfully inserted ${dataArray.length} total rows`);
    return dataArray;
  } catch (reason) {
    throw new Error(`Failed to bulk insert data into BQ: ${getErrorMessage(reason)}`);
  }
};

// Helper function to extract error message (you may already have this)
function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return JSON.stringify(error);
}

export const updateBQAssetHistory = async (pipeline: PipelineData, assetId: string) => {
  try {
    // Find the asset in pipeline.asset_management_data that has id==assetId
    const asset = pipeline.asset_management_data.find((a) => a.id === assetId);
    if (!asset) {
      throw new Error(`Asset with id ${assetId} not found in pipeline data`);
    }

    // Take the latest date between last_inference_time and last_train_time, call this last_hist_update
    let lastHistUpdate: Date | null = null;

    if (asset.last_inference_time) {
      const lastInferenceDate = new Date(asset.last_inference_time);
      lastHistUpdate = lastInferenceDate;
    }

    if (asset.last_train_time) {
      const lastTrainDate = new Date(asset.last_train_time);
      if (!lastHistUpdate || lastTrainDate > lastHistUpdate) {
        lastHistUpdate = lastTrainDate;
      }
    }

    // Query the _asset_history collection to get all data with asset.id in the asset_id column,
    // and change_date greater than last_hist_update
    const col = ClearBladeAsync.Collection('_asset_history');
    let query = ClearBladeAsync.Query().equalTo('asset_id', asset.id);

    if (lastHistUpdate) {
      query = query.greaterThan('change_date', lastHistUpdate.toISOString());
    }

    // Sort from earliest to most recent _asset_history rows
    query = query.ascending('change_date');

    const historyData = await col.fetch(query);

    if (historyData.TOTAL === 0) {
      console.log(`No new asset history data found for asset ${assetId}`);
      return;
    }

    let histRows = historyData.DATA as unknown as AssetHistoryRow[];

    // Create attribute configuration for resampling
    const attributeConfig: Record<string, { type: string; resampleMethod: string }> = {};

    // Add attributes_to_predict
    pipeline.attributes_to_predict.forEach((attr) => {
      attributeConfig[attr.attribute_name] = {
        type: attr.attribute_type,
        resampleMethod: attr.attribute_type === 'boolean' ? 'mode' : 'mean',
      };
    });

    // Add supporting_attributes
    pipeline.supporting_attributes.forEach((attr) => {
      attributeConfig[attr.attribute_name] = {
        type: attr.attribute_type,
        resampleMethod: attr.attribute_type === 'boolean' ? 'mode' : 'mean',
      };
    });

    // Process and resample the data
    histRows = processAndResampleData(histRows, pipeline.timestep, attributeConfig);

    // Prepare data for BigQuery insertion
    const bqData: BQDataSchema[] = histRows.map((histRow) => ({
      date_time: histRow.change_date,
      asset_type_id: pipeline.asset_type_id,
      asset_id: histRow.asset_id,
      data: histRow.changes.custom_data as Record<string, number>,
    }));

    // Add the data to the BQ collection using addBulkDataToBQ
    await addBulkDataToBQ(bqData);

    console.log(
      `Successfully processed and added ${bqData.length} asset history records to BigQuery for asset ${assetId}`,
    );
  } catch (error) {
    console.error(`Error in updateBQAssetHistory for asset ${assetId}:`, error);
    throw error;
  }
};

export const processAndResampleData = (
  data: AssetHistoryRow[],
  timestepMinutes: number,
  attributeConfig: Record<string, { type: string; resampleMethod: string }>,
): AssetHistoryRow[] => {
  if (data.length === 0) {
    return data;
  }

  // Sort data by timestamp to ensure chronological order
  const sortedData = [...data].sort((a, b) => new Date(a.change_date).getTime() - new Date(b.change_date).getTime());

  const assetId = sortedData[0].asset_id;
  const startTime = new Date(sortedData[0].change_date);
  const endTime = new Date(sortedData[sortedData.length - 1].change_date);

  // Align start time to timestep boundary
  const alignedStartMinute = Math.floor(startTime.getMinutes() / timestepMinutes) * timestepMinutes;
  startTime.setMinutes(alignedStartMinute, 0, 0);

  const resampledData: AssetHistoryRow[] = [];
  let currentTime = new Date(startTime);
  let dataIndex = 0;

  // Track last known values for forward filling
  const lastKnownValues: Record<string, number> = {};

  while (currentTime <= endTime) {
    const intervalEnd = new Date(currentTime.getTime() + timestepMinutes * 60 * 1000);

    // Collect all data points in this interval
    const intervalValues: Record<string, number[]> = {};
    Object.keys(attributeConfig).forEach((attr) => {
      intervalValues[attr] = [];
    });

    // Advance through sorted data to find points in current interval
    while (dataIndex < sortedData.length) {
      const dataPoint = sortedData[dataIndex];
      const dataTime = new Date(dataPoint.change_date);

      if (dataTime >= intervalEnd) {
        break; // This point belongs to a future interval
      }

      // Process data point - convert booleans and filter attributes
      Object.keys(dataPoint.changes.custom_data).forEach((attr) => {
        if (attributeConfig[attr]) {
          let value = dataPoint.changes.custom_data[attr];
          if (typeof value === 'boolean') {
            value = value ? 1 : 0;
          }

          // Update last known value
          lastKnownValues[attr] = value as number;

          // Add to interval if within time range
          if (dataTime >= currentTime) {
            intervalValues[attr].push(value as number);
          }
        }
      });

      dataIndex++;
    }

    // Reset dataIndex to handle overlapping intervals correctly
    // Find the first data point that could affect the next interval
    while (dataIndex > 0 && new Date(sortedData[dataIndex - 1].change_date) >= currentTime) {
      dataIndex--;
    }

    // Aggregate values for this interval
    const aggregatedData: Record<string, number> = {};

    Object.keys(attributeConfig).forEach((attr) => {
      const values = intervalValues[attr];
      const config = attributeConfig[attr];

      if (values.length > 0) {
        // Use actual data points in the interval
        if (config.resampleMethod === 'mean') {
          aggregatedData[attr] = values.reduce((sum, val) => sum + val, 0) / values.length;
        } else if (config.resampleMethod === 'mode') {
          // Find most frequent value (for boolean data)
          const counts: Record<number, number> = {};
          values.forEach((val) => {
            counts[val] = (counts[val] || 0) + 1;
          });
          aggregatedData[attr] = Number(
            Object.keys(counts).reduce((a, b) => (counts[Number(a)] > counts[Number(b)] ? a : b)),
          );
        }
      } else if (lastKnownValues[attr] !== undefined) {
        // Forward fill with last known value
        aggregatedData[attr] = lastKnownValues[attr];
      }
    });

    // Only add row if we have data for at least one attribute
    if (Object.keys(aggregatedData).length > 0) {
      resampledData.push({
        asset_id: assetId,
        change_date: currentTime.toISOString(),
        changes: { custom_data: aggregatedData },
      });
    }

    // Move to next interval
    currentTime = new Date(intervalEnd);
  }

  return resampledData;
};

export const getAssetModel = async (assetId: string): Promise<string> => {
  try {
    const fs = ClearBladeAsync.FS('ia-forecasting');

    // Read the models directory
    const modelsPath = 'outbox/models';
    const modelsDirContents = await fs.readDir(modelsPath);

    // Find numeric folders (filter for directories that are just numbers)
    const numericFolders = modelsDirContents
      .filter((path) => {
        const folderName = path.split('/').pop();
        return folderName && /^\d+$/.test(folderName);
      })
      .map((path) => path.split('/').pop())
      .filter(Boolean);

    if (numericFolders.length === 0) {
      throw new Error('No numeric model folders found');
    }

    // For each numeric folder, look for asset-specific subfolders
    let bestMatch: { path: string; timestamp: string } | null = null;

    for (const numericFolder of numericFolders) {
      const numericFolderPath = `${modelsPath}/${numericFolder}`;

      try {
        const subfolders = await fs.readDir(numericFolderPath);

        // Filter subfolders that contain the assetId and have timestamp format
        const assetFolders = subfolders.filter((path) => {
          const folderName = path.split('/').pop();
          if (!folderName) return false;

          // Check if folder name contains assetId and has timestamp format (yyyymmddhhmmss - 14 digits)
          const hasAssetId = folderName.includes(assetId);
          const timestampMatch = folderName.match(/(\d{14})/); // Match 14 consecutive digits

          return hasAssetId && timestampMatch;
        });

        // Extract timestamps and find the most recent
        for (const assetFolder of assetFolders) {
          const folderName = assetFolder.split('/').pop();
          if (!folderName) continue;

          const timestampMatch = folderName.match(/(\d{14})/);
          if (!timestampMatch) continue;

          const timestamp = timestampMatch[1];

          if (!bestMatch || timestamp > bestMatch.timestamp) {
            bestMatch = {
              path: assetFolder,
              timestamp: timestamp,
            };
          }
        }
      } catch (error) {
        // Continue to next numeric folder if this one fails
        console.warn(`Failed to read numeric folder ${numericFolder}:`, error);
        continue;
      }
    }

    if (!bestMatch) {
      throw new Error(`No model folders found for asset ${assetId}`);
    }

    // Now look inside the best match folder for the unknown named subfolder
    const bestMatchContents = await fs.readDir(bestMatch.path);

    // Find folders (not files) within the asset folder
    const subfolders = bestMatchContents.filter((path) => {
      const parts = path.split('/');
      return parts.length > bestMatch.path.split('/').length;
    });

    // Look for output_trained_model/checkpoint.pth in each subfolder
    for (const subfolder of subfolders) {
      const parts = subfolder.split('/');
      const subfolderPath = parts.slice(0, bestMatch.path.split('/').length + 1).join('/');

      try {
        const checkpointPath = `${subfolderPath}/output_trained_model/checkpoint.pth`;

        // Try to check if the checkpoint file exists
        const subfolderContents = await fs.readDir(subfolderPath);
        const hasOutputFolder = subfolderContents.some((path) => path.includes('output_trained_model/checkpoint.pth'));

        if (hasOutputFolder) {
          // Convert the bucket set path to gsutil path
          const gsutilPath = `gs://clearblade-predictive-forecasting/${cbmeta.system_key}/ia-forecasting/${checkpointPath}`;
          return gsutilPath;
        }
      } catch (error) {
        // Continue to next subfolder if this one fails
        continue;
      }
    }

    throw new Error(`No checkpoint.pth file found for asset ${assetId} in the most recent model folder`);
  } catch (error) {
    console.error(`Error getting asset model for ${assetId}:`, error);
    throw new Error(`Failed to get asset model: ${getErrorMessage(error)}`);
  }
};

//functions I still need to write:
//handleNewForecast(pipeline: PipelineData, assetId: string): Promise<void>

interface ForecastData {
  timestamp: string;
  predictions: Record<string, number>;
}

interface FileSystem {
  readDir(path: string): Promise<string[]>;
  readFile(path: string, encoding?: string): Promise<string | Uint8Array>;
  renameFile(oldPath: string, newPath: string): Promise<void>;
}

const findLatestForecastFolder = async (fs: FileSystem, assetId: string): Promise<string | null> => {
  const forecastPath = 'outbox/forecasts';

  try {
    const forecastContents = await fs.readDir(forecastPath);

    // Find numeric folders first
    const numericFolders = forecastContents
      .filter((path: string) => {
        const folderName = path.split('/').pop();
        return folderName && /^\d+$/.test(folderName);
      })
      .map((path: string) => path.split('/').pop())
      .filter(Boolean);

    if (numericFolders.length === 0) return null;

    let bestMatch: { path: string; timestamp: string } | null = null;

    for (const numericFolder of numericFolders) {
      const numericFolderPath = `${forecastPath}/${numericFolder}`;

      try {
        const subfolders = await fs.readDir(numericFolderPath);

        const assetFolders = subfolders.filter((path: string) => {
          const folderName = path.split('/').pop();
          if (!folderName) return false;

          const hasAssetId = folderName.includes(assetId);
          const timestampMatch = folderName.match(/(\d{14})/);

          return hasAssetId && timestampMatch;
        });

        for (const assetFolder of assetFolders) {
          const folderName = assetFolder.split('/').pop();
          if (!folderName) continue;

          const timestampMatch = folderName.match(/(\d{14})/);
          if (!timestampMatch) continue;

          const timestamp = timestampMatch[1];

          if (!bestMatch || timestamp > bestMatch.timestamp) {
            bestMatch = { path: assetFolder, timestamp };
          }
        }
      } catch (error) {
        continue;
      }
    }

    return bestMatch?.path || null;
  } catch (error) {
    return null;
  }
};

const extractForecastData = async (fs: FileSystem, forecastFolderPath: string): Promise<ForecastData[]> => {
  try {
    const folderContents = await fs.readDir(forecastFolderPath);

    // Look for forecast CSV files only
    const forecastFiles = folderContents.filter((path: string) => path.includes('forecast') && path.endsWith('.csv'));

    if (forecastFiles.length === 0) {
      throw new Error('No forecast CSV files found');
    }

    const forecastData: ForecastData[] = [];

    for (const filePath of forecastFiles) {
      try {
        const fileContent = (await fs.readFile(filePath, 'utf8')) as string;

        // Parse CSV forecast data
        const lines = fileContent.split('\n').filter((line: string) => line.trim());

        if (lines.length < 2) {
          console.warn(`Forecast file ${filePath} has insufficient data`);
          continue;
        }

        const headers = lines[0].split(',').map((h: string) => h.trim());

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map((v: string) => v.trim());

          if (values.length !== headers.length) {
            console.warn(`Skipping malformed row ${i} in ${filePath}`);
            continue;
          }

          const row: ForecastData = {
            timestamp: values[0], // First column should be the date/timestamp
            predictions: {},
          };

          // Process all other columns as predictions
          for (let j = 1; j < headers.length; j++) {
            const value = parseFloat(values[j]);
            if (!isNaN(value)) {
              row.predictions[headers[j]] = value;
            }
          }

          if (Object.keys(row.predictions).length > 0) {
            forecastData.push(row);
          }
        }
      } catch (error) {
        console.warn(`Failed to parse forecast file ${filePath}:`, error);
        continue;
      }
    }

    return forecastData;
  } catch (error) {
    throw new Error(`Failed to extract forecast data: ${getErrorMessage(error)}`);
  }
};

const updateAssetHistoryWithForecasts = async (
  assetId: string,
  forecastData: ForecastData[],
  attributesToPredict: string[],
): Promise<void> => {
  if (forecastData.length === 0) return;

  const col = ClearBladeAsync.Collection('_asset_history');

  // Filter and format forecast data for insertion
  const historyUpdates = forecastData
    .filter((forecast) => forecast.timestamp && Object.keys(forecast.predictions).length > 0)
    .map((forecast) => ({
      asset_id: assetId,
      change_date: new Date(forecast.timestamp).toISOString(),
      changes: {
        custom_data: Object.fromEntries(
          Object.entries(forecast.predictions)
            .filter(([attr]) => attributesToPredict.includes(attr))
            .map(([attr, value]) => [attr, typeof value === 'number' ? value : parseFloat(String(value))]),
        ),
      },
    }))
    .filter((update) => Object.keys(update.changes.custom_data).length > 0);

  if (historyUpdates.length === 0) {
    console.log(`No valid forecast data to update for asset ${assetId}`);
    return;
  }

  // Batch insert the forecast data
  const batchSize = 50;
  for (let i = 0; i < historyUpdates.length; i += batchSize) {
    const batch = historyUpdates.slice(i, i + batchSize);

    try {
      await Promise.all(
        batch.map((update) =>
          col.create(update).catch((error) => {
            console.warn(`Failed to insert forecast record for ${assetId} at ${update.change_date}:`, error);
          }),
        ),
      );
    } catch (error) {
      console.error(`Batch insert failed for asset ${assetId}:`, error);
    }
  }

  console.log(`Successfully updated ${historyUpdates.length} forecast records for asset ${assetId}`);
};

// Add function to rename forecast file after processing
const markForecastAsProcessed = async (fs: FileSystem, forecastFolderPath: string): Promise<void> => {
  try {
    const folderContents = await fs.readDir(forecastFolderPath);
    const forecastFiles = folderContents.filter((path: string) => path.includes('forecast.csv'));

    for (const filePath of forecastFiles) {
      const processedPath = filePath.replace('forecast.csv', 'processed.csv');
      try {
        await fs.renameFile(filePath, processedPath);
        console.log(`Renamed ${filePath} to ${processedPath}`);
      } catch (error) {
        console.warn(`Failed to rename ${filePath}:`, error);
      }
    }
  } catch (error) {
    console.warn(`Failed to mark forecast as processed:`, error);
  }
};

export const handleNewForecast = async (pipeline: PipelineData, assetId: string): Promise<void> => {
  try {
    const fs = ClearBladeAsync.FS('ia-forecasting') as FileSystem;

    // Find the latest forecast folder for this asset
    const latestForecastFolder = await findLatestForecastFolder(fs, assetId);

    if (!latestForecastFolder) {
      console.log(`No forecast folders found for asset ${assetId}`);
      return;
    }

    // Extract forecast data from the folder
    let forecastData = await extractForecastData(fs, latestForecastFolder);

    if (forecastData.length === 0) {
      console.log(`No forecast data found for asset ${assetId}`);
      return;
    }

    //revert all boolean values to true or false based on attribute_type
    forecastData = restoreForecastBooleans(forecastData, pipeline.attributes_to_predict);

    //interpolate the forecast data to have a value for every minute
    forecastData = interpolateForecastData(forecastData);

    // Get list of attributes that should receive forecasts
    const attributesToPredict = pipeline.attributes_to_predict.map((attr) => attr.attribute_name);

    // Update the _asset_history collection with the new forecast data
    await updateAssetHistoryWithForecasts(assetId, forecastData, attributesToPredict);

    // Mark the forecast file as processed by renaming it
    await markForecastAsProcessed(fs, latestForecastFolder);

    console.log(`Successfully processed forecast data for asset ${assetId}`);
  } catch (error) {
    console.error(`Error handling new forecast for asset ${assetId}:`, error);
    throw new Error(`Failed to handle new forecast: ${getErrorMessage(error)}`);
  }
};

const restoreForecastBooleans = (forecastData: ForecastData[], attributesToPredict: Attributes[]): ForecastData[] => {
  //if attribute_name is in a key or the forecast_data, then check if that attribute_type is boolean, if so convert the value to true or false based on if the value is closer to 1 or 0
  forecastData.forEach((forecast) => {
    attributesToPredict.forEach((attr) => {
      if (forecast.predictions[attr.attribute_name] !== undefined && attr.attribute_type === 'boolean') {
        const numericValue = forecast.predictions[attr.attribute_name];
        forecast.predictions[attr.attribute_name] = numericValue >= 0.5 ? 1 : 0;
      }
    });
  });
  return forecastData;
};

const interpolateForecastData = (forecastData: ForecastData[]): ForecastData[] => {
  if (forecastData.length === 0) return forecastData;

  // Sort data by timestamp
  const sortedData = [...forecastData].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const interpolatedData: ForecastData[] = [];
  const oneMinuteMs = 60 * 1000; // Always interpolate to 1-minute intervals

  // Get the time range
  const startTime = new Date(sortedData[0].timestamp);
  const endTime = new Date(sortedData[sortedData.length - 1].timestamp);

  // Create a map of timestamps to data for quick lookup
  const dataMap = new Map<number, ForecastData>();
  sortedData.forEach((data) => {
    dataMap.set(new Date(data.timestamp).getTime(), data);
  });

  // Generate data points every minute from start to end
  for (let currentTime = startTime.getTime(); currentTime <= endTime.getTime(); currentTime += oneMinuteMs) {
    const timestamp = new Date(currentTime).toISOString();

    // If we have exact data for this timestamp, use it
    if (dataMap.has(currentTime)) {
      interpolatedData.push(dataMap.get(currentTime)!);
      continue;
    }

    // Find the surrounding data points
    let beforeData: ForecastData | null = null;
    let afterData: ForecastData | null = null;

    for (const data of sortedData) {
      const dataTime = new Date(data.timestamp).getTime();
      if (dataTime <= currentTime) {
        beforeData = data;
      }
      if (dataTime > currentTime && !afterData) {
        afterData = data;
        break;
      }
    }

    const interpolatedPredictions: Record<string, number> = {};

    // Get all unique attribute names from surrounding data
    const allAttributes = new Set<string>();
    if (beforeData) Object.keys(beforeData.predictions).forEach((attr) => allAttributes.add(attr));
    if (afterData) Object.keys(afterData.predictions).forEach((attr) => allAttributes.add(attr));

    allAttributes.forEach((attr) => {
      const beforeValue = beforeData?.predictions[attr];
      const afterValue = afterData?.predictions[attr];

      if (beforeValue !== undefined && afterValue !== undefined) {
        // We have values before and after - check if it's a boolean (0 or 1)
        const isBoolean = (beforeValue === 0 || beforeValue === 1) && (afterValue === 0 || afterValue === 1);

        if (isBoolean) {
          // Forward fill for booleans
          interpolatedPredictions[attr] = beforeValue;
        } else {
          // Linear interpolation for numbers
          if (beforeData && afterData) {
            const beforeTime = new Date(beforeData.timestamp).getTime();
            const afterTime = new Date(afterData.timestamp).getTime();
            const progress = (currentTime - beforeTime) / (afterTime - beforeTime);
            interpolatedPredictions[attr] = beforeValue + (afterValue - beforeValue) * progress;
          }
        }
      } else if (beforeValue !== undefined) {
        // Only have before value - forward fill
        interpolatedPredictions[attr] = beforeValue;
      } else if (afterValue !== undefined) {
        // Only have after value - back fill
        interpolatedPredictions[attr] = afterValue;
      }
    });

    if (Object.keys(interpolatedPredictions).length > 0) {
      interpolatedData.push({
        timestamp,
        predictions: interpolatedPredictions,
      });
    }
  }

  return interpolatedData;
};
