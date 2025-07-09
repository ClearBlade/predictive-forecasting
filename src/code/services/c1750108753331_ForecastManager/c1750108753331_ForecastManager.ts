/**
 * Type: Micro Service
 * Description: A short-lived service which is expected to complete within a fixed period of time.
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
  getAssetModel,
  shouldRunTrainingPipeline,
  shouldRunInferencePipeline,
  updateBQAssetHistory,
  startTrainingPipeline,
  startInferencePipeline,
  handleNewForecast,
  updatePipelineRows,
  PipelineData,
  isThresholdMet,
} from './utils';

async function c1750108753331_ForecastManager(_: CbServer.BasicReq, resp: CbServer.Resp) {
  try {
    const currentTime = new Date();
    const pipelines: PipelineData[] = await getPipelines();
    const updatedPipelines: PipelineData[] = [];

    for (const pipeline of pipelines) {
      let pipelineUpdated = false;

      for (const asset of pipeline.asset_management_data) {
        try {
          // Step 1: Check for new asset model
          const newAssetModel = await getAssetModel(asset.id);
          if (newAssetModel && newAssetModel !== asset.asset_model) {
            asset.asset_model = newAssetModel;
            pipelineUpdated = true;
            console.log(`Updated asset model for ${asset.id}: ${newAssetModel}`);
          }

          // Step 2: Check if training pipeline should run
          const thresholdMet = await isThresholdMet(asset.id, pipeline.timestep);
          if (shouldRunTrainingPipeline(asset) && thresholdMet) {
            console.log('Updating asset history!');
            await updateBQAssetHistory(pipeline, asset.id);
            const trainResult = await startTrainingPipeline(pipeline, asset);

            if (!trainResult.error) {
              asset.last_train_time = currentTime.toISOString();
              const nextTrainTime = new Date(currentTime.getTime() + pipeline.retrain_frequency * 24 * 60 * 60 * 1000);
              asset.next_train_time = nextTrainTime.toISOString();
              pipelineUpdated = true;
              console.log(`Started training pipeline for ${asset.id}`);
              continue; // Skip inference step
            } else {
              console.error(`Training pipeline failed for ${asset.id}: ${trainResult.message}`);
            }
          }

          // Step 3: Check if inference pipeline should run
          if (shouldRunInferencePipeline(asset)) {
            console.log('Initializing inference pipeline');
            await updateBQAssetHistory(pipeline, asset.id);
            const inferenceResult = await startInferencePipeline(pipeline, asset);
            if (!inferenceResult.error) {
              asset.last_inference_time = currentTime.toISOString();
              const forecast_length_days = pipeline.forecast_length;
              const next_inference_time = new Date(
                currentTime.getTime() +
                  pipeline.forecast_refresh_rate * 60 * 60 * 1000 +
                  forecast_length_days * 24 * 60 * 60 * 1000,
              );
              asset.next_inference_time = next_inference_time.toISOString();
              pipelineUpdated = true;
            } else {
              console.error(`Inference pipeline failed for ${asset.id}: ${inferenceResult.message}`);
            }
          }

          // Step 4: Handle new forecast data
          await handleNewForecast(pipeline, asset.id);
        } catch (error) {
          console.error(`Error processing asset ${asset.id}:`, error);
        }
      }

      if (pipelineUpdated) {
        updatedPipelines.push(pipeline);
      }
    }

    // Update all modified pipelines
    if (updatedPipelines.length > 0) {
      await updatePipelineRows(updatedPipelines);
    }

    console.log('Forecast pipeline management completed successfully');
    resp.success('Success');
  } catch (error) {
    console.error('Error in cb_ForecastManager:', error);
    resp.error('Failed to manage forecast pipelines: ' + JSON.stringify(error));
  }
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
global.c1750108753331_ForecastManager = c1750108753331_ForecastManager;
