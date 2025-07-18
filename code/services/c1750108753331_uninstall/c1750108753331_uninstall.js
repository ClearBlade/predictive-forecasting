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

function c1750108753331_uninstall(req, resp) {
  const CACHE_KEY = 'google-bigquery-forecasting-config'
  const PROJECT_ID = 'clearblade-ipm'
  const DATASET_ID = 'predictive_forecasting'

  const params = req.params;
  const entity_id = params.entity_id;

  function removeForecastPipeline() {
    const col = ClearBladeAsync.Collection('forecast_ml_pipelines');
    const query = ClearBladeAsync.Query().equalTo('asset_type_id', entity_id);
    return col.remove(query);
  }

  function getAccessToken() {
    const cache = ClearBladeAsync.Cache('AccessTokenCache');
    return cache.get(CACHE_KEY);
  }

  function removeBQData(token, id) {
    const query = "DELETE FROM `" + PROJECT_ID + "." + DATASET_ID + "." + cbmeta.system_key + "_forecast` WHERE asset_type_id = '" + id + "'";
    const queryRequest = {
      query: query,
      useLegacySql: false,
      timeoutMs: 60000,
    };

    return fetch('https://bigquery.googleapis.com/bigquery/v2/projects/' + PROJECT_ID + '/queries', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(queryRequest),
    })
      .then(function (response) {
        if (!response.ok) {
          return Promise.reject('BigQuery API error: ' + response.status + ' - ' + response.text());
        }
        return response.json();
      })
      .then(function (data) {
        if (!data.jobComplete) {
          return Promise.reject('BigQuery job did not complete');
        }
        if (data.errors && data.errors.length > 0) {
          return Promise.reject('BigQuery errors: ' + JSON.stringify(data.errors));
        }
        return Promise.resolve('Deleted BQ data');
      })
      .catch(function (error) {
        return Promise.reject(error);
      });
  }

  function getAssetTypeInfo() {
    return fetch('https://' + cbmeta.platform_url + '/api/v/1/code/' + cbmeta.system_key + '/fetchTableItems?id=assetTypes.read', {
      method: 'POST',
      headers: {
        'ClearBlade-UserToken': req.userToken,
      },
      body: JSON.stringify({
        name: 'assetTypes.read',
        body: {
          "query": {
            "Queries": [
              [
                {
                    "Operator": "=",
                    "Field": "id",
                    "Value": entity_id
                }
              ]
            ],
            "Order": [],
            "PageSize": 100,
            "PageNumber": 1,
            "Columns": [],
            "Distinct": "",
            "GroupBy": [],
            "RawQuery": "",
            "PrimaryKey": []
        }
        },
      }),
    }).then(function(response) {
      if (!response.ok) {
        throw new Error('Failed to fetch asset type info: ' + response.statusText);
      }
      return response.json();
    }).then(function(data) {
      if (data.results.COUNT === 0) {
        throw new Error('Asset type not found');
      }
      return data.results.DATA[0];
    });
  }

  function getGroupsForAssetType() {
    return fetch('https://' + cbmeta.platform_url + '/api/v/1/code/' + cbmeta.system_key + '/fetchTableItems?id=groupsForAssetType.read', {
      method: 'POST',
      headers: {
        'ClearBlade-UserToken': req.userToken,
      },
      body: JSON.stringify({
        name: 'groupsForAssetType.read',
        body: {
          id: entity_id,
        },
      }),
    })
      .then(function(response) {
        if (!response.ok) {
          throw new Error('Failed to fetch groups for asset type: ' + response.statusText);
        }
        return response.json();
      })
      .then(function(data) {
        if (data.results.COUNT === 0) {
          throw new Error('No groups found for asset type');
        }
        return data.results.DATA.map(function(group) {
          return group.id;
        });
      });
  }

  function removeForecastAttributes(assetTypeInfo, groupIds) {
    // Remove forecast attributes from asset type schema
    const schema = JSON.parse(assetTypeInfo.schema);
    var categories = assetTypeInfo.categories;
    const newSchema = schema.filter(function (attr) {
      return !attr.attribute_name.startsWith('predicted_');
    });
    // remove all predicted_ attributes from categories
    if (categories) {
      categories[0].attributes = categories[0].attributes.filter(function (name) {
        return !name.startsWith('predicted_');
      });
    }
    assetTypeInfo.schema = JSON.stringify(newSchema);
    assetTypeInfo.categories = categories;

    // Update asset type with removed attributes
    return fetch('https://' + cbmeta.platform_url + '/api/v/1/code/' + cbmeta.system_key + '/updateTableItems?id=assetTypes.update', {
      method: 'POST',
      headers: {
        'ClearBlade-UserToken': req.userToken,
      },
      body: JSON.stringify({
        name: 'assetTypes.update',
        body: {
          item: assetTypeInfo,
          groupIds,
        },
      }),
    }).then(function(response) {
      if (!response.ok) {
        throw new Error('Failed to update asset type: ' + response.statusText);
      }
      return response.json();
    });
  }

  Promise.all([
    removeForecastPipeline(),
    getAccessToken(),
  ]).then(function(results) {
    const token = results[1];
    if (!token || !token.accessToken) {
      log('No access token found, so not deleting BQ data');
      return Promise.resolve();
    }
    return removeBQData(token.accessToken, entity_id).catch(function (error) {
        console.error('Failed to remove BQ data, continuing with uninstall:', error);
        return Promise.resolve();
      });
    })
    .then(function () {
      return Promise.all([getAssetTypeInfo(), getGroupsForAssetType()]);
    })
    .then(function (results) {
      const assetTypeInfo = results[0];
      const groupIds = results[1];
      return removeForecastAttributes(assetTypeInfo, groupIds);
    })
    .then(resp.success)
    .catch(resp.error);
}
