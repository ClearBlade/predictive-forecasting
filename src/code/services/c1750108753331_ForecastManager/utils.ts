import { AssetHistory } from '@ia/common/collection-types/asset_history';
import { Attributes } from '@ia/common/collection-types/components';

const PROJECT_ID = 'clearblade-ipm';
const DATASET_ID = 'predictive_forecasting';
const TABLE_ID = cbmeta.system_key + '_forecast';
const SCRIPT_PATH = 'gs://clearblade-predictive-forecasting/forecast-script/SageFormer_IoT_Forecasting.py';
const LOCATION = 'us-central1';
const VERTEX_AI_ENDPOINT = `https://${LOCATION}-aiplatform.googleapis.com/v1`;
const TRAINING_TEMPLATE_URI =
  'https://us-central1-kfp.pkg.dev/clearblade-ipm/cb-ml-pipelines/forecast-train-pipeline-template/sha256:c567c7f3c370df07d5699a2ad6fc3aed09a9a08d6cd22ad83e136110e79a970d';
const INFERENCE_TEMPLATE_URI =
  'https://us-central1-kfp.pkg.dev/clearblade-ipm/cb-ml-pipelines/forecast-inference-pipeline-template/sha256:f72f73fef903ea690380b82f7048233555cab44022b9ab7eaa5944b78116ed30';
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

interface AssetHistoryRow {
  asset_id: string;
  change_date: string;
  changes: { custom_data: Record<string, number | boolean> };
}

interface SubscriptionConfig {
  CB_FORWARD_TOPIC: string;
  FORWARD_TO_CB_TOPIC: boolean;
  accessToken: string;
  maxMessages: number;
  pullUrl: string;
  ackUrl: string;
  subscriptionType: string;
}

interface BQDataSchema {
  date_time: string;
  asset_type_id: string;
  asset_id: string;
  data: Record<string, number>;
}

interface BQRow {
  json: { date_time: string; asset_type_id: string; asset_id: string; data: string };
}

interface ForecastData {
  timestamp: string;
  predictions: Record<string, number>;
}

interface FileSystem {
  readDir(path: string): Promise<string[]>;
  readFile(path: string, encoding?: string): Promise<string | Uint8Array>;
  renameFile(oldPath: string, newPath: string): Promise<void>;
}

export const getPipelines = async (): Promise<PipelineData[]> => {
  const col = ClearBladeAsync.Collection<PipelineData>({
    collectionName: 'forecast_ml_pipelines',
  });
  const data = await col.fetch(ClearBladeAsync.Query());
  if (data.TOTAL === 0) return [];
  return data.DATA;
};

// Checks if there is at least 5x the forecast length of data in the _asset_history collection for the asset
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

    const thresholdMinutes = 5 * timeStep * 672 + timeStep * 96;
    const thresholdTime = new Date(currentTime.getTime() - thresholdMinutes * 60 * 1000);
    return oldestDate < thresholdTime;
  } catch (error) {
    console.error('Error checking threshold:', error);
    return false;
  }
};

// if current time is greater than next_train_time, then return true, otherwise return false
export const shouldRunTrainingPipeline = (asset: AssetManagementData): boolean => {
  if (!asset.next_train_time) {
    return false;
  }
  const currentTime = new Date();
  const nextTrainTime = new Date(asset.next_train_time);
  return currentTime > nextTrainTime;
};

// if current time is greater than next_inference_time and asset_model is not null, then return true, otherwise return false
export const shouldRunInferencePipeline = (asset: AssetManagementData): boolean => {
  if (!asset.next_inference_time || !asset.asset_model) {
    return false;
  }
  const currentTime = new Date();
  const nextInferenceTime = new Date(asset.next_inference_time);
  return currentTime > nextInferenceTime;
};

// start the training pipeline
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
    const bigQueryToken = allSubscriptions['google-bigquery-forecasting-config'].accessToken;

    if (!bigQueryToken) {
      throw new Error(
        "BigQuery Token is undefined or empty. Please check the subscription 'google-bigquery-forecasting-config'.",
      );
    }
    const timestamp = new Date().toISOString().replace(/[-:Z]/g, '').replace(/\./g, '').replace('T', '').slice(0, -3);
    const modelId = asset.id + '_' + timestamp;
    const pipelineConfig = {
      displayName: modelId,
      runtimeConfig: {
        gcsOutputDirectory: OUTPUT_DIRECTORY + '/pipeline',
        parameterValues: {
          bq_query: `SELECT date_time, asset_type_id, asset_id, data  FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`  WHERE asset_id = '${asset.id}' AND asset_type_id = '${pipelineData.asset_type_id}' ORDER BY date_time`,
          gcp_project_id: PROJECT_ID,
          model_id: modelId,
          system_key: cbmeta.system_key,
          asset_id: asset.id,
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

// start the inference pipeline
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
    const bigQueryToken = allSubscriptions['google-bigquery-forecasting-config'].accessToken;

    if (!bigQueryToken) {
      throw new Error(
        "BigQuery Token is undefined or empty. Please check the subscription 'google-bigquery-forecasting-config'.",
      );
    }
    const timestamp = new Date().toISOString().replace(/[-:Z]/g, '').replace(/\./g, '').replace('T', '').slice(0, -3);
    const modelId = asset.id + '_' + timestamp;
    const pipelineConfig = {
      displayName: modelId,
      runtimeConfig: {
        gcsOutputDirectory: OUTPUT_DIRECTORY + '/pipeline',
        parameterValues: {
          bq_query: `SELECT date_time, asset_type_id, asset_id, data  FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`  WHERE asset_id = '${asset.id}' AND asset_type_id = '${pipelineData.asset_type_id}' ORDER BY date_time`,
          gcp_project_id: PROJECT_ID,
          model_id: modelId,
          model_gcs_path: asset.asset_model,
          script_gcs_path: SCRIPT_PATH,
          system_key: cbmeta.system_key,
          asset_id: asset.id,
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
      const errorText = pipelineResponse.text();
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

//update the forecast_ml_pipelines collection
export const updatePipelineRows = async (rows: PipelineData[]): Promise<void> => {
  const col = ClearBladeAsync.Collection({
    collectionName: 'forecast_ml_pipelines',
  });
  const promises = rows.map((row) => {
    return col.update(ClearBladeAsync.Query().equalTo('asset_type_id', row.asset_type_id), row);
  });
  await Promise.all(promises);
};

const cacheName = 'AccessTokenCache';

const AccessTokenCache = (asyncClient = ClearBladeAsync) => {
  const cache = asyncClient.Cache<SubscriptionConfig>(cacheName);

  return {
    getAll: () => cache.getAll(),
    set: (subscriptionID: string, data: SubscriptionConfig) => cache.set(subscriptionID, data),
  };
};

// bulk insert data into BigQuery
const addBulkDataToBQ = async (dataArray: BQDataSchema[]): Promise<BQDataSchema[]> => {
  if (dataArray.length === 0) {
    return dataArray;
  }

  try {
    const allSubscriptions = await AccessTokenCache()
      .getAll()
      .catch((err) => Promise.reject({ error: true, message: err }));
    const bigQueryToken = allSubscriptions['google-bigquery-forecasting-config'].accessToken;

    if (!bigQueryToken) {
      throw new Error(
        "BigQuery Token is undefined or empty. Please check the subscription 'google-bigquery-forecasting-config'.",
      );
    }

    //Estimate size of first row to determine batch size
    const firstRowBQ: BQRow = {
      json: {
        date_time: dataArray[0].date_time,
        asset_type_id: dataArray[0].asset_type_id,
        asset_id: dataArray[0].asset_id,
        data: JSON.stringify(dataArray[0].data),
      },
    };

    const firstRowSizeBytes = JSON.stringify(firstRowBQ).length;
    const firstRowSizeKB = Math.ceil(firstRowSizeBytes / 100) / 10; // Round up to nearest 0.1 KB

    //Calculate how many rows fit in ~500KB batches
    const targetBatchSizeKB = 500;
    const rowsPerBatch = Math.floor(targetBatchSizeKB / firstRowSizeKB);
    const actualRowsPerBatch = Math.max(1, rowsPerBatch); // Ensure at least 1 row per batch

    //Create batches
    const batches: BQDataSchema[][] = [];
    for (let i = 0; i < dataArray.length; i += actualRowsPerBatch) {
      batches.push(dataArray.slice(i, i + actualRowsPerBatch));
    }

    //Retries a batch up to 3 times if it fails
    const processBatchWithRetry = async (
      batch: BQDataSchema[],
      batchIndex: number,
      maxRetries = 3,
    ): Promise<boolean> => {
      const rows: BQRow[] = batch.map((data) => ({
        json: {
          date_time: data.date_time,
          asset_type_id: data.asset_type_id,
          asset_id: data.asset_id,
          data: JSON.stringify(data.data),
        },
      }));

      const insertAllPayload = {
        rows: rows,
      };

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const insertResponse = await fetch(
            `https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT_ID}/datasets/${DATASET_ID}/tables/${TABLE_ID}/insertAll`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${bigQueryToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(insertAllPayload),
            },
          );

          if (!insertResponse.ok) {
            const errorText = await insertResponse.text();
            throw new Error(`Error in BigQuery insertAll (batch ${batchIndex + 1}, attempt ${attempt}): ${errorText}`);
          }

          const insertResult = (await insertResponse.json()) as { insertErrors: string[] };

          // Check for insert errors in the response
          if (insertResult.insertErrors && insertResult.insertErrors.length > 0) {
            console.warn(`Insert errors in batch ${batchIndex + 1}, attempt ${attempt}:`, insertResult.insertErrors);
            // Continue processing - these are row-level errors, not batch failures
          }

          return true; // Success
        } catch (error) {
          const isFirstBatch = batchIndex === 0;
          const isLastAttempt = attempt === maxRetries;

          if (isFirstBatch) {
            // If first batch fails, throw error immediately (don't retry)
            throw error;
          }

          if (isLastAttempt) {
            console.error(`Batch ${batchIndex + 1} failed after ${maxRetries} attempts:`, error);
            return false; // Failed
          } else {
            // Log retry attempt
            console.warn(`Batch ${batchIndex + 1} failed on attempt ${attempt}, retrying...`, error);
            // Add a small delay before retrying
            await new Promise((resolve) => setTimeout(resolve, 800 * attempt)); // Exponential backoff
          }
        }
      }

      return false;
    };

    let failedBatches = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      const success = await processBatchWithRetry(batch, batchIndex);

      if (!success) {
        failedBatches++;
      }
    }

    if (failedBatches > 0) {
      console.warn(`${failedBatches} batches failed after retries, but processing continued`);
    }

    return dataArray;
  } catch (reason) {
    throw new Error(`Failed to bulk insert data into BQ: ${getErrorMessage(reason)}`);
  }
};

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return JSON.stringify(error);
}

// update the the bigquery table with the latest asset history data for asset
export const updateBQAssetHistory = async (pipeline: PipelineData, assetId: string) => {
  try {
    const asset = pipeline.asset_management_data.find((a) => a.id === assetId);
    if (!asset) {
      throw new Error(`Asset with id ${assetId} not found in pipeline data`);
    }

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

    const col = ClearBladeAsync.Collection('_asset_history');
    let query = ClearBladeAsync.Query().equalTo('asset_id', asset.id);

    if (lastHistUpdate) {
      query = query.greaterThan('change_date', lastHistUpdate.toISOString());
    }

    query = query.ascending('change_date');

    let histRows: AssetHistoryRow[] = [];
    let pageNum = 0;
    const pageSize = 100;
    let hasMoreData = true;
    while (hasMoreData) {
      const paginatedQuery = query.setPage(pageSize, pageNum);
      const historyData = await col.fetch(paginatedQuery);
      if (historyData.DATA && historyData.DATA.length > 0) {
        histRows = histRows.concat(historyData.DATA as unknown as AssetHistoryRow[]);
        pageNum++;
      } else {
        hasMoreData = false;
      }
    }

    if (histRows.length === 0) {
      return;
    }

    const attributeConfig: Record<string, { type: string; resampleMethod: string }> = {};

    pipeline.attributes_to_predict.forEach((attr) => {
      attributeConfig[attr.attribute_name] = {
        type: attr.attribute_type,
        resampleMethod: attr.attribute_type === 'boolean' ? 'mode' : 'mean',
      };
    });

    pipeline.supporting_attributes.forEach((attr) => {
      attributeConfig[attr.attribute_name] = {
        type: attr.attribute_type,
        resampleMethod: attr.attribute_type === 'boolean' ? 'mode' : 'mean',
      };
    });

    histRows = processAndResampleData(histRows, pipeline.timestep, attributeConfig);

    const bqData: BQDataSchema[] = histRows.map((histRow) => ({
      date_time: histRow.change_date,
      asset_type_id: pipeline.asset_type_id,
      asset_id: histRow.asset_id,
      data: histRow.changes.custom_data as Record<string, number>,
    }));

    await addBulkDataToBQ(bqData);
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
          } else if (typeof value === 'string') {
            // Convert string numbers to actual numbers
            value = parseFloat(value);
            if (isNaN(value)) {
              console.warn(`Invalid numeric value for ${attr}: ${dataPoint.changes.custom_data[attr]}`);
              return; // Skip this attribute
            }
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

    while (dataIndex > 0 && new Date(sortedData[dataIndex - 1].change_date) >= currentTime) {
      dataIndex--;
    }

    const aggregatedData: Record<string, number> = {};

    Object.keys(attributeConfig).forEach((attr) => {
      const values = intervalValues[attr];
      const config = attributeConfig[attr];

      if (values.length > 0) {
        if (config.resampleMethod === 'mean') {
          aggregatedData[attr] = values.reduce((sum, val) => sum + val, 0) / values.length;
        } else if (config.resampleMethod === 'mode') {
          const counts: Record<number, number> = {};
          values.forEach((val) => {
            counts[val] = (counts[val] || 0) + 1;
          });
          aggregatedData[attr] = Number(
            Object.keys(counts).reduce((a, b) => (counts[Number(a)] > counts[Number(b)] ? a : b)),
          );
        }
      } else if (lastKnownValues[attr] !== undefined) {
        // fill with last known value if no data is available
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

    currentTime = new Date(intervalEnd);
  }

  return resampledData;
};

// fetch the asset model gsutil path from the file system
export const getAssetModel = async (assetId: string): Promise<string> => {
  try {
    const fs = ClearBladeAsync.FS('ia-forecasting');
    const modelPath = `outbox/${assetId}/models/${assetId}.pth`;
    try {
      await fs.readFile(modelPath);
      const gsutilPath = `gs://clearblade-predictive-forecasting/${cbmeta.system_key}/ia-forecasting/${modelPath}`;
      return gsutilPath;
    } catch (fileError) {
      return '';
    }
  } catch (error) {
    console.error(`Error getting asset model for ${assetId}:`, error);
    throw new Error(`Failed to get asset model: ${getErrorMessage(error)}`);
  }
};

const findLatestForecastFile = async (fs: FileSystem, forecastFolderPath: string): Promise<string | null> => {
  try {
    const folderContents = await fs.readDir(forecastFolderPath);
    const forecastFiles = folderContents.filter((path: string) => path.endsWith('.csv') && !path.includes('processed'));

    if (forecastFiles.length === 0) {
      return null;
    }

    let latestFile = '';
    let latestTimestamp = '';

    for (const filePath of forecastFiles) {
      const fileName = filePath.split('/').pop();
      if (!fileName) continue;

      const timestampMatch = fileName.match(/(\d{14})\.csv$/);
      if (!timestampMatch) continue;

      const timestamp = timestampMatch[1];
      if (timestamp > latestTimestamp) {
        latestTimestamp = timestamp;
        latestFile = filePath;
      }
    }

    return latestFile || null;
  } catch (error) {
    return null;
  }
};

// extract the forecast data from the forecast csv
const extractForecastData = async (fs: FileSystem, forecastFilePath: string): Promise<ForecastData[]> => {
  try {
    const forecastData: ForecastData[] = [];

    const fileContent = (await fs.readFile(forecastFilePath, 'utf8')) as string;

    // Parse CSV forecast data
    const lines = fileContent.split('\n').filter((line: string) => line.trim());

    if (lines.length < 2) {
      console.warn(`Forecast file ${forecastFilePath} has insufficient data`);
      return [];
    }

    const headers = lines[0].split(',').map((h: string) => h.trim());

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v: string) => v.trim());

      if (values.length !== headers.length) {
        console.warn(`Skipping malformed row ${i} in ${forecastFilePath}`);
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

    return forecastData;
  } catch (error) {
    throw new Error(`Failed to extract forecast data: ${getErrorMessage(error)}`);
  }
};

// update the asset history collection with the forecast data
const updateAssetHistoryWithForecasts = async (
  assetId: string,
  forecastData: ForecastData[],
  attributesToPredict: string[],
): Promise<boolean> => {
  if (forecastData.length === 0) return false;

  const col = ClearBladeAsync.Collection('_asset_history');

  const historyUpdates = forecastData
    .filter((forecast) => forecast.timestamp && Object.keys(forecast.predictions).length > 0)
    .map((forecast) => {
      const customData: Record<string, number> = {};
      Object.entries(forecast.predictions).forEach(([columnName, value]) => {
        if (columnName.includes('predicted')) {
          for (const attrName of attributesToPredict) {
            if (columnName.includes(attrName)) {
              let targetAttributeName: string;
              if (columnName.includes('upper')) {
                targetAttributeName = `predicted ${attrName} upper bound`;
              } else if (columnName.includes('lower')) {
                targetAttributeName = `predicted ${attrName} lower bound`;
              } else {
                targetAttributeName = `predicted ${attrName}`;
              }
              customData[targetAttributeName] = typeof value === 'number' ? value : parseFloat(String(value));
              break;
            }
          }
        } else {
          for (const attrName of attributesToPredict) {
            if (columnName.includes(attrName)) {
              let targetAttributeName: string;

              if (columnName.includes('upper')) {
                targetAttributeName = `predicted ${attrName} upper bound`;
              } else if (columnName.includes('lower')) {
                targetAttributeName = `predicted ${attrName} lower bound`;
              } else {
                targetAttributeName = `predicted ${attrName}`;
              }
              customData[targetAttributeName] = typeof value === 'number' ? value : parseFloat(String(value));
              break; // Found the attribute, no need to check others
            }
          }
        }
      });

      return {
        asset_id: assetId,
        change_date: new Date(forecast.timestamp).toISOString(),
        changes: { custom_data: customData },
      };
    })
    .filter((update) => Object.keys(update.changes.custom_data).length > 0);

  if (historyUpdates.length === 0) {
    return false;
  }

  // Batch insert the forecast data
  const batchSize = 48;
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

  return true;
};

// rename the forecast file after adding to the asset history collection
const markForecastAsProcessed = async (fs: FileSystem, forecastFilePath: string): Promise<void> => {
  try {
    // Create processed filename by inserting 'processed_' before the timestamp
    const fileName = forecastFilePath.split('/').pop();
    if (fileName) {
      const processedFileName = fileName.replace(/(\d{14})\.csv$/, 'processed_$1.csv');
      const processedPath = forecastFilePath.replace(fileName, processedFileName);

      try {
        await fs.renameFile(forecastFilePath, processedPath);
      } catch (error) {
        console.warn(`Failed to rename ${forecastFilePath}:`, error);
      }
    }
  } catch (error) {
    console.warn(`Failed to mark forecast as processed:`, error);
  }
};

// handle the most recently generated forecast for asset if there is a new one
export const handleNewForecast = async (pipeline: PipelineData, assetId: string): Promise<void> => {
  try {
    const fs = ClearBladeAsync.FS('ia-forecasting') as FileSystem;

    const forecastFolderPath = `outbox/${assetId}/forecasts`;

    const latestForecastFile = await findLatestForecastFile(fs, forecastFolderPath);

    if (!latestForecastFile) {
      return;
    }

    let forecastData = await extractForecastData(fs, latestForecastFile);

    if (forecastData.length === 0) {
      return;
    }

    forecastData = alignStartTime(forecastData, pipeline.asset_management_data, assetId);

    // Revert all boolean values to true or false based on attribute_type,
    forecastData = restoreForecastBooleans(forecastData, pipeline.attributes_to_predict);

    // Interpolate the forecast data to have a value for every minute
    forecastData = interpolateForecastData(forecastData);

    // Get list of attributes that should receive forecasts
    const attributesToPredict = pipeline.attributes_to_predict.map((attr) => attr.attribute_name);

    // Update the _asset_history collection with the new forecast data
    const updateSuccess = await updateAssetHistoryWithForecasts(assetId, forecastData, attributesToPredict);

    // Mark the forecast file as processed by renaming it
    if (updateSuccess) {
      await markForecastAsProcessed(fs, latestForecastFile);
      console.log(`Successfully processed forecast data for asset ${assetId}`);
    }
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
      const data = dataMap.get(currentTime);
      if (data) {
        interpolatedData.push(data);
      }
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

// align start time of forecast data to the last time the forecast was generated, helps with aligning to system timezone
const alignStartTime = (
  forecastData: ForecastData[],
  assetManagementData: AssetManagementData[],
  assetId: string,
): ForecastData[] => {
  if (forecastData.length === 0) {
    return forecastData;
  }

  // Find the asset in assetManagementData
  const asset = assetManagementData.find((a) => a.id === assetId);
  if (!asset || !asset.last_inference_time) {
    console.warn(`No last_inference_time found for asset ${assetId}, returning forecast data as-is`);
    return forecastData;
  }

  // Parse the last_inference_time (format: 2025-07-08T16:30:09.148Z)
  // This is the last time the forecast was generated for the asset
  const lastInferenceTime = new Date(asset.last_inference_time);

  // Find the first forecast timestamp (format: 2025-07-01 16:30:00)
  const firstForecastTimestamp = forecastData[0].timestamp;
  const firstForecastTime = new Date(firstForecastTimestamp);

  // Calculate the time difference
  const timeDifference = lastInferenceTime.getTime() - firstForecastTime.getTime();

  // Shift all forecast timestamps by the difference
  const alignedForecastData = forecastData.map((forecast) => {
    const originalTime = new Date(forecast.timestamp);
    const adjustedTime = new Date(originalTime.getTime() + timeDifference);

    return {
      ...forecast,
      timestamp: adjustedTime.toISOString(),
    };
  });

  return alignedForecastData;
};
