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

function forecast_teardown(req, resp) {
  const CACHE_KEY = 'google-bigquery-forecasting-config'
  
  Promise.all([
    removeSubscriptionRow(),
    deleteExternalDB(),
    deleteBucketSet(),
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
}