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

function c1750108753331_install(req, resp) {
  const params = req.params;
  const payload = params.mfe_settings;
  const col = ClearBladeAsync.Collection('forecast_ml_pipelines');
  const currentTime = new Date().toISOString();

  function createForecastAttributeLabel(attributeName) {
    return attributeName.replace(/_/g, ' ').replace(/\b\w/g, function (l) {
      return l.toUpperCase();
    });
  }

  var forecast_refresh_rate = 7; 
  var retrain_frequency = 0;
  var forecast_length = 7;
  var timestep = 15;
  var attributes_to_predict = [];
  var supporting_attributes = [];
  var asset_management_data = [];
  var forecast_start_date = null;

  if (payload) {
    if (payload.forecast_refresh_rate) {
      forecast_refresh_rate = payload.forecast_refresh_rate;
    }
    if (payload.retrain_frequency && typeof payload.retrain_frequency === 'number') {
      retrain_frequency = payload.retrain_frequency;
    }
    if (payload.forecast_length) {
      forecast_length = payload.forecast_length;
    }
    if (payload.attributes_to_predict && Array.isArray(payload.attributes_to_predict)) {
      attributes_to_predict = payload.attributes_to_predict;
    }
    if (payload.supporting_attributes && Array.isArray(payload.supporting_attributes)) {
      supporting_attributes = payload.supporting_attributes;
    }
    if (payload.forecast_start_date) {
      forecast_start_date = payload.forecast_start_date;
    }

    if (payload.asset_management_data && Array.isArray(payload.asset_management_data)) {
      const nextInferenceTime = forecast_start_date || currentTime;

      const nextInferenceDate = new Date(nextInferenceTime);
      const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      var nextTrainTime;

      if (nextInferenceDate < oneDayFromNow) {
        nextTrainTime = currentTime;
      } else {
        const trainDate = new Date(nextInferenceDate.getTime() - 24 * 60 * 60 * 1000);
        nextTrainTime = trainDate.toISOString();
      }

      asset_management_data = payload.asset_management_data.map(function (asset) {
        return Object.assign({}, asset, {
          asset_model: null,
          last_inference_time: null,
          next_inference_time: nextInferenceTime,
          last_train_time: null,
          next_train_time: nextTrainTime,
        });
      });
    }
  }

  timestep = Math.round((forecast_length * 1440) / 672);

  function createForecastPipeline() {
    if (!forecast_start_date) {
      forecast_start_date = undefined;
    }

    return col.create({
      asset_type_id: params.entity_id,
      attributes_to_predict: attributes_to_predict,
      supporting_attributes: supporting_attributes,
      asset_management_data: asset_management_data,
      forecast_refresh_rate: forecast_refresh_rate,
      retrain_frequency: retrain_frequency,
      forecast_length: forecast_length,
      timestep: timestep,
      forecast_start_date: forecast_start_date,
      latest_settings_update: currentTime,
    }).catch(function(err) {
      throw err;
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
                  "Value": params.entity_id
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
    }).then(function (response) {
      if (!response.ok) {
        throw new Error('Failed to fetch asset type info: ' + response.statusText);
      }
      return response.json();
    }).then(function (data) {
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
          id: params.entity_id,
        },
      }),
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Failed to fetch groups for asset type: ' + response.statusText);
        }
        return response.json();
      })
      .then(function (data) {
        if (data.results.COUNT === 0) {
          throw new Error('No groups found for asset type');
        }
        return data.results.DATA.map(function (group) {
          return group.id;
        });
      });
  }

  function addForecastAttributes(assetTypeInfo, groupIds) {

    var attributesToAdd = [];
    var schema = JSON.parse(assetTypeInfo.schema);
    var categories = assetTypeInfo.categories;
    var names = []

    attributes_to_predict.forEach(function (attribute) {
      var feature_name = attribute.attribute_name;

      var predictedName = 'predicted ' + feature_name;
      var upperName = 'predicted_' + feature_name + '_upper_bound';
      var lowerName = 'predicted_' + feature_name + '_lower_bound';

      names.push(predictedName);
      names.push(upperName);
      names.push(lowerName);

      var predictedExists = schema.some(function (attr) {
        return attr.attribute_name === predictedName;
      });
      var upperExists = schema.some(function (attr) {
        return attr.attribute_name === upperName;
      });
      var lowerExists = schema.some(function (attr) {
        return attr.attribute_name === lowerName;
      });

      if (!predictedExists) {
        attributesToAdd.push(Object.assign({}, attribute, {
          uuid: newUUID(),
          attribute_name: predictedName,
          attribute_label: createForecastAttributeLabel('Predicted ' + feature_name),
        }));
      }
      if (!upperExists) {
        attributesToAdd.push(Object.assign({}, attribute, {
          uuid: newUUID(),
          attribute_name: upperName,
          attribute_label: createForecastAttributeLabel('Predicted ' + feature_name + ' (Upper Bound)'),
        }));
      }
      if (!lowerExists) {
        attributesToAdd.push(Object.assign({}, attribute, {
          uuid: newUUID(),
          attribute_name: lowerName,
          attribute_label: createForecastAttributeLabel('Predicted ' + feature_name + ' (Lower Bound)'),
        }));
      }
    });

    var newSchema = attributesToAdd.concat(schema);
    if(categories) {
      names.forEach(function(name) {
        categories[0].attributes.push(name);
      });
    }
    assetTypeInfo.schema = JSON.stringify(newSchema);
    assetTypeInfo.categories = categories;

    var attributeInfo = attributesToAdd.map(function (attr) {
      return {
        uuid: attr.uuid,
        attribute_label: attr.attribute_label,
      };
    });

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
        throw new Error('Failed to update asset type with forecast attributes: ' + response.statusText);
      }
      return response.json();
    }).then(function() {
      return attributeInfo;
    });
  }

  var groups = [];
  var assetTypeInfo = {};
  var attributeIds = [];

  Promise.all([
    createForecastPipeline(),
    getGroupsForAssetType(),
    getAssetTypeInfo()
  ]).then(function(results) {
    groups = results[1];
    assetTypeInfo = results[2];
    return addForecastAttributes(assetTypeInfo, groups);
  }).then(function(results) {
    attributeIds = results;
    return resp.success("Success");
  }).then(resp.success).catch(resp.error);
}
