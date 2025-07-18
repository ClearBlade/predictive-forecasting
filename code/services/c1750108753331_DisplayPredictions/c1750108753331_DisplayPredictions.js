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

function c1750108753331_DisplayPredictions(req, resp) {
  const db = ClearBladeAsync.Database();
  const assetsCol = ClearBladeAsync.Collection('assets');

  ClearBladeAsync.Collection('forecast_ml_pipelines')
    .fetch(ClearBladeAsync.Query())
    .then(function (data) {
      var assetIds = [];

      data.DATA.forEach(function (row) {
        if (row.asset_management_data) {
          row.asset_management_data.forEach(function (asset) {
            assetIds.push(asset.id);
          });
        }
      });

      if (assetIds.length === 0) {
        return resp.success('No assets found in forecast pipelines');
      }

      const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
      const now = new Date().toISOString();

      const historyQuery =
        "SELECT asset_id, changes, change_date FROM _asset_history WHERE asset_id = ANY($1) AND change_date BETWEEN $2 AND $3 AND changes::text LIKE '%predicted_%' ORDER BY asset_id, change_date DESC";

      return db.query(historyQuery, assetIds, oneMinuteAgo, now);
    })
    .then(function (historyResults) {
      if (historyResults.length === 0) {
        return resp.success('No recent predicted values found');
      }

      // Get most recent entry per asset (since results are ordered by asset_id, change_date DESC)
      var latestByAsset = {};
      historyResults.forEach(function (row) {
        if (!latestByAsset[row.asset_id]) {
          latestByAsset[row.asset_id] = row;
        }
      });

      var uniqueResults = Object.keys(latestByAsset).map(function (assetId) {
        return latestByAsset[assetId];
      });

      return Promise.all(
        uniqueResults.map(function (historyRow) {
          const assetId = historyRow.asset_id;
          const predictedData = {};

          Object.keys(historyRow.changes.custom_data || {}).forEach(function (key) {
            if (key.includes('predicted_')) {
              predictedData[key] = historyRow.changes.custom_data[key];
            }
          });

          if (Object.keys(predictedData).length === 0) {
            return Promise.resolve();
          }

          return assetsCol.fetch(ClearBladeAsync.Query().equalTo('id', assetId)).then(function (assetData) {
            if (assetData.TOTAL === 0) {
              return Promise.resolve();
            }

            const asset = assetData.DATA[0];
            const currentCustomData = asset.custom_data ? JSON.parse(asset.custom_data) : {};
            const updatedCustomData = Object.assign({}, currentCustomData, predictedData);

            return assetsCol.update(ClearBladeAsync.Query().equalTo('id', assetId), {
              custom_data: JSON.stringify(updatedCustomData),
            });
          });
        })
      );
    })
    .then(function () {
      resp.success('Successfully updated assets with predicted values');
    })
    .catch(function (error) {
      console.error('Error in DisplayPredictions:', error);
      resp.error('Failed to update predictions: ' + error);
    });
}
