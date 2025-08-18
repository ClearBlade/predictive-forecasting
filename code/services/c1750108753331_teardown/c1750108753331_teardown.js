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

function c1750108753331_teardown(req, resp) {
  const CACHE_KEY = 'google-bigquery-forecasting-config';
  
  Promise.all([
    removeSubscriptionRow(),
    deleteExternalDB(),
    deleteBucketSet(),
    deleteBQConnectors(),
  ]).then(function() {
    resp.success('Forecasting teardown completed successfully!');
  }).catch(function(err) {
    resp.error(err);
  });

  function removeSubscriptionRow() {
    const col = ClearBladeAsync.Collection('subscriptions');
    return col.remove(ClearBladeAsync.Query().equalTo('id', CACHE_KEY)).then(function() {
      return Promise.resolve('Deleted existing forecasting subscription');
    }).catch(function() {
      return Promise.resolve('No existing forecasting subscription');
    });
  }

  function deleteExternalDB() {
    return fetch('https://' + cbmeta.platform_url + '/api/v/4/external-db/' + cbmeta.system_key + '/IAForecastingBQDB', {
      headers: {
        'ClearBlade-DevToken': req.userToken,
      },
      method: 'DELETE',
    })
      .then(function(response) {
        if (!response.ok) {
          return Promise.reject(response.text());
        }
        return Promise.resolve('External forecasting DB deleted!');
      })
      .catch(function(error) {
        return Promise.reject(error);
      });
  }

  function deleteBucketSet() {
    return fetch('https://' + cbmeta.platform_url + '/api/v/4/bucket_sets/' + cbmeta.system_key + '/ia-forecasting', {
      headers: {
        'ClearBlade-DevToken': req.userToken,
      },
      method: 'DELETE',
    })
      .then(function(response) {
        if (!response.ok) {
          return Promise.reject(response.text());
        }
        return Promise.resolve('Forecasting bucket set deleted!');
      })
      .catch(function(error) {
        return Promise.reject(error);
      });
  }

  function deleteBQConnectors() {
    return Promise.all([
      deleteBatchConnector(),
      deleteCollectionConnector(),
      deleteBQConnectCollection(),
    ]).catch(function(error) {
      console.warn('MQTT connector cleanup failed (connectors may not exist):', error);
      return Promise.resolve('MQTT connectors cleanup skipped');
    });
  }

  function deleteBatchConnector() {
    return fetch('https://' + cbmeta.platform_url + '/api/v/1/mqtt-connectors/' + cbmeta.system_key + '/asset-history-batch', {
      headers: {
        'ClearBlade-DevToken': req.userToken,
      },
      method: 'DELETE',
    })
      .then(function(response) {
        if (!response.ok) {
          if (response.status === 404) {
            return Promise.resolve('Batch connector not found (already deleted)');
          }
          return Promise.reject(response.text());
        }
        return Promise.resolve('Batch connector deleted!');
      })
      .catch(function(error) {
        console.warn('Failed to delete batch connector:', error);
        return Promise.resolve('Batch connector cleanup skipped');
      });
  }

  function deleteCollectionConnector() {
    return fetch('https://' + cbmeta.platform_url + '/api/v/1/mqtt-connectors/' + cbmeta.system_key + '/asset-history-collection', {
      headers: {
        'ClearBlade-DevToken': req.userToken,
      },
      method: 'DELETE',
    })
      .then(function(response) {
        if (!response.ok) {
          if (response.status === 404) {
            return Promise.resolve('Collection connector not found (already deleted)');
          }
          return Promise.reject(response.text());
        }
        return Promise.resolve('Collection connector deleted!');
      })
      .catch(function(error) {
        console.warn('Failed to delete collection connector:', error);
        return Promise.resolve('Collection connector cleanup skipped');
      });
  }

  function deleteBQConnectCollection() {
    return fetch('https://' + cbmeta.platform_url + '/api/v/3/collectionmanagement/bq_asset_history', {
      headers: {
        'ClearBlade-DevToken': req.userToken,
        'ClearBlade-SystemKey': cbmeta.system_key,
      },
      method: 'DELETE',
    })
      .then(function(response) {
        if (!response.ok) {
          if (response.status === 404) {
            return Promise.resolve('BQ connect collection not found (already deleted)');
          }
          return Promise.reject(response.text());
        }
        return Promise.resolve('BQ connect collection deleted!');
      })
      .catch(function(error) {
        console.warn('Failed to delete BQ connect collection:', error);
        return Promise.resolve('BQ connect collection cleanup skipped');
      });
  }
}
