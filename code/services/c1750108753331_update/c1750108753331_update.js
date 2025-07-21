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

function c1750108753331_update(req, resp) {
  const params = req.params;
  const payload = params.mfe_settings;
  const currentTime = new Date().toISOString();

  const col = ClearBladeAsync.Collection('forecast_ml_pipelines');
  const query = ClearBladeAsync.Query().equalTo('asset_type_id', params.entity_id);

  function createForecastAttributeLabel(attributeName) {
    return attributeName.replace(/_/g, ' ').replace(/\b\w/g, function (l) {
      return l.toUpperCase();
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

  function updateForecastAttributes(assetTypeInfo, groupIds, newAttributesToPredict, currentAttributesToPredict) {
    var schema = JSON.parse(assetTypeInfo.schema);
    var categories = assetTypeInfo.categories;
    var attributesToAdd = [];
    var attributeNamesToRemove = [];
    var categoriesToAdd = [];
    var categoriesToRemove = [];

    var currentPredictedNames = [];
    if (currentAttributesToPredict && Array.isArray(currentAttributesToPredict)) {
      currentAttributesToPredict.forEach(function (attribute) {
        var feature_name = attribute.attribute_name;
        currentPredictedNames.push('predicted_' + feature_name);
        currentPredictedNames.push('predicted_' + feature_name + '_upper_bound');
        currentPredictedNames.push('predicted_' + feature_name + '_lower_bound');
      });
    }

    var newPredictedNames = [];
    if (newAttributesToPredict && Array.isArray(newAttributesToPredict)) {
      newAttributesToPredict.forEach(function (attribute) {
        var feature_name = attribute.attribute_name;
        newPredictedNames.push('predicted_' + feature_name);
        newPredictedNames.push('predicted_' + feature_name + '_upper_bound');
        newPredictedNames.push('predicted_' + feature_name + '_lower_bound');
      });
    }

    newAttributesToPredict.forEach(function (attribute) {
      var feature_name = attribute.attribute_name;
      var predictedName = 'predicted_' + feature_name;
      var upperName = 'predicted_' + feature_name + '_upper_bound';
      var lowerName = 'predicted_' + feature_name + '_lower_bound';

      var isCurrentlyPredicted = currentPredictedNames.includes(predictedName);
      
      if (!isCurrentlyPredicted) {
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
          categoriesToAdd.push(predictedName);
        }
        if (!upperExists) {
          attributesToAdd.push(Object.assign({}, attribute, {
            uuid: newUUID(),
            attribute_name: upperName,
            attribute_label: createForecastAttributeLabel('Predicted ' + feature_name + ' (Upper Bound)'),
          }));
          categoriesToAdd.push(upperName);
        }
        if (!lowerExists) {
          attributesToAdd.push(Object.assign({}, attribute, {
            uuid: newUUID(),
            attribute_name: lowerName,
            attribute_label: createForecastAttributeLabel('Predicted ' + feature_name + ' (Lower Bound)'),
          }));
          categoriesToAdd.push(lowerName);
        }
      }
    });

    currentPredictedNames.forEach(function (attributeName) {
      if (!newPredictedNames.includes(attributeName)) {
        attributeNamesToRemove.push(attributeName);
        categoriesToRemove.push(attributeName);
      }
    });

    schema = schema.filter(function (attr) {
      return !attributeNamesToRemove.includes(attr.attribute_name);
    });

    var newSchema = attributesToAdd.concat(schema);

    if (categories && categories[0] && categories[0].attributes) {
      categories[0].attributes = categories[0].attributes.filter(function (attrName) {
        return !categoriesToRemove.includes(attrName);
      });
      
      categoriesToAdd.forEach(function(name) {
        categories[0].attributes.push(name);
      });
    }

    assetTypeInfo.schema = JSON.stringify(newSchema);
    assetTypeInfo.categories = categories;

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
    });
  }

  // First fetch the existing record to get current asset_management_data
  col.fetch(query).then(function (data) {
      if (data.DATA.length === 0) {
        return resp.error('No existing forecast configuration found for asset_type_id: ' + params.entity_id);
      }

      const existingRecord = data.DATA[0];
      const existingAssetData = existingRecord.asset_management_data || [];
      const currentRetrainingFreq = existingRecord.retrain_frequency || 0;
      const currentAttributesToPredict = existingRecord.attributes_to_predict || [];

      const updateData = {
        asset_type_id: params.entity_id,
        latest_settings_update: currentTime,
      };

      var newRetrainingFreq = currentRetrainingFreq;
      var newAttributesToPredict = currentAttributesToPredict;

      if (payload) {
        if (payload.forecast_refresh_rate) {
          updateData.forecast_refresh_rate = payload.forecast_refresh_rate;
        }
        if (payload.retrain_frequency) {
          newRetrainingFreq =
            typeof payload.retrain_frequency === 'number' && payload.retrain_frequency > 0
              ? payload.retrain_frequency
              : 0;
          updateData.retrain_frequency = newRetrainingFreq;
        }
        if (payload.forecast_length) {
          updateData.forecast_length = payload.forecast_length;
          updateData.timestep = Math.round((payload.forecast_length * 1440) / 672);
        }
        if (payload.attributes_to_predict && Array.isArray(payload.attributes_to_predict)) {
          updateData.attributes_to_predict = payload.attributes_to_predict;
          newAttributesToPredict = payload.attributes_to_predict;
        }
        if (payload.supporting_attributes && Array.isArray(payload.supporting_attributes)) {
          updateData.supporting_attributes = payload.supporting_attributes;
        }
        if (payload.forecast_start_date) {
          updateData.forecast_start_date = payload.forecast_start_date;
        }

        if (payload.asset_management_data && Array.isArray(payload.asset_management_data)) {
          var existingAssetMap = {};
          existingAssetData.forEach(function (existingAsset) {
            if (existingAsset.id) {
              existingAssetMap[existingAsset.id] = existingAsset;
            }
          });

          updateData.asset_management_data = payload.asset_management_data.map(function (asset) {
            var existingAsset = existingAssetMap[asset.id];

            if (existingAsset) {
              var preservedData = {
                asset_model: existingAsset.asset_model,
                last_inference_time: existingAsset.last_inference_time,
                last_train_time: existingAsset.last_train_time,
                next_inference_time: existingAsset.next_inference_time,
                next_train_time: existingAsset.next_train_time,
              };

              if (existingAsset.last_inference_time && payload.forecast_refresh_rate) {
                const lastInferenceDate = new Date(existingAsset.last_inference_time);
                const nextInferenceDate = new Date(lastInferenceDate.getTime() + payload.forecast_refresh_rate * 24 * 60 * 60 * 1000);
                preservedData.next_inference_time = nextInferenceDate.toISOString();
              }

              if (payload.forecast_start_date && preservedData.next_inference_time) {
                const forecastStartDate = new Date(payload.forecast_start_date);
                const nextInferenceDate = new Date(preservedData.next_inference_time);

                if (nextInferenceDate < forecastStartDate) {
                  const tenMinutesBefore = new Date(forecastStartDate.getTime() - 10 * 60 * 1000);
                  preservedData.next_inference_time = tenMinutesBefore.toISOString();
                }
              }

              if (existingAsset.last_train_time && newRetrainingFreq > 0) {
                const lastTrainDate = new Date(existingAsset.last_train_time);
                const nextTrainDate = new Date(lastTrainDate.getTime() + newRetrainingFreq * 24 * 60 * 60 * 1000);
                preservedData.next_train_time = nextTrainDate.toISOString();
              }

              if (payload.forecast_start_date) {
                const forecastStartDate = new Date(payload.forecast_start_date);
                const twoHoursBefore = new Date(forecastStartDate.getTime() - 2 * 60 * 60 * 1000);
                preservedData.next_train_time = twoHoursBefore.toISOString();
              }

              if (!preservedData.next_train_time) {
                preservedData.next_train_time = currentTime;
              }

              return Object.assign({}, asset, preservedData);
            } else {
              var newAssetData = {
                asset_model: null,
                last_inference_time: null,
                last_train_time: null,
                next_inference_time: null,
                next_train_time: currentTime,
              };

              return Object.assign({}, asset, newAssetData);
            }
          });
        }
      }

      return col.update(query, updateData).then(function () {
        var attributesChanged = JSON.stringify(currentAttributesToPredict) !== JSON.stringify(newAttributesToPredict);

        if (attributesChanged) {
          return Promise.all([getGroupsForAssetType(), getAssetTypeInfo()]).then(function (results) {
            var groups = results[0];
            var assetTypeInfo = results[1];
            return updateForecastAttributes(assetTypeInfo, groups, newAttributesToPredict, currentAttributesToPredict);
          }).then(function() {
            const nextInferenceTime = payload.forecast_start_date || currentTime;
            const nextInferenceDate = new Date(nextInferenceTime);
            const oneDayFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
            var nextTrainTime;
            if (nextInferenceDate < oneDayFromNow) {
              nextTrainTime = currentTime;
            } else {
              const trainDate = new Date(nextInferenceDate.getTime() - 24 * 60 * 60 * 1000);
              nextTrainTime = trainDate.toISOString();
            }
            if (updateData.asset_management_data && Array.isArray(updateData.asset_management_data)) {
              updateData.asset_management_data.forEach(function(asset) {
                asset.asset_model = null;
                asset.last_train_time = null;
                asset.next_train_time = nextTrainTime;
                asset.next_inference_time = nextInferenceTime;
              });              
              return col.update(query, { asset_management_data: updateData.asset_management_data });
            }
            return Promise.resolve();
          });
        }

        return Promise.resolve();
      });
    })
    .then(resp.success)
    .catch(resp.error);
}
