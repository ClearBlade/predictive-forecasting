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

function c1750108753331_setup(req, resp) {
  const SECRET_KEY = 'gcp-bigquery-service-account';
  const CACHE_KEY = 'google-bigquery-forecasting-config';
  const PROJECT_ID = 'clearblade-ipm';
  const DATASET_ID = 'predictive_forecasting';
  
  var mySecret = {}

  checkForSubscription().then(function(subscriptionExists) {
    if (subscriptionExists) {
      resp.success('Done');
    }
    return Promise.resolve();
  }).then(function() {
    return readSecret();
  }).then(function(secret) {
    if (secret === '') {
      resp.error('secret not found: ' + SECRET_KEY)
    }
    mySecret = secret;
    return addSubscriptionRow(secret);
  }).then(function (config){
    return generateAccessToken(config);
  }).then(function(tokenInfo) {
    return Promise.all([
      createBQTable(tokenInfo),
      createExternalDB(mySecret),
      createBucketSet(mySecret),
      createBQConnectors(mySecret),
    ]);
  }).then(function() {
    resp.success('Forecasting setup completed successfully!');
  }).catch(function(err) {
    resp.error(err);
  });

  function readSecret() {
    const secret = ClearBladeAsync.Secret();
    return secret.read(SECRET_KEY);
  }

  function checkForSubscription() {
    const col = ClearBladeAsync.Collection('subscriptions');
    return col.fetch(ClearBladeAsync.Query().equalTo('id', CACHE_KEY)).then(function(data) {
      if (data.DATA.length > 0) {
        return Promise.resolve(true);
      }
      return Promise.resolve(false);
    });
  }

  function addSubscriptionRow(secret) {
    const config = {
      SUBSCRIPTION_SERVICE_ACCOUNT_PRIVATE_KEY: secret.private_key,
      SERVICE_EMAIL: secret.client_email,
      API_ENDPOINT: 'https://bigquery.googleapis.com/bigquery/v2/projects/' + PROJECT_ID + '/datasets/' + DATASET_ID,
      ALGORITHM: 'RS256',
      AUTH_SCOPE: 'https://www.googleapis.com/auth/cloud-platform',
      TOKEN_EXPIRY_PERIOD_IN_SECS: 3600,
    }
    const col = ClearBladeAsync.Collection('subscriptions');
    return col.create({
      details: 'Google Vertex AI Forecasting Component',
      type: 'googlevertexai',
      config: JSON.stringify(config),
      id: CACHE_KEY,
    }).then(function() {
      return Promise.resolve(config);
    }).catch(function(error) {
      return Promise.reject(error);
    });
  }

  function generateAccessToken(config) {
    const claims = {
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + config.TOKEN_EXPIRY_PERIOD_IN_SECS,
      aud: 'https://oauth2.googleapis.com/token',
      scope: config.AUTH_SCOPE,
      iss: config.SERVICE_EMAIL,
    };
    const jwtToken = crypto.create_jwt(claims, config.ALGORITHM, config.SUBSCRIPTION_SERVICE_ACCOUNT_PRIVATE_KEY);

    return fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwtToken,
      }),
    }).then(function (response) {
      if (!response.ok) {
        const responseText = response.text();
        console.error('Failed to get token: ', response.statusText, responseText);
        throw new Error(response.statusText + ': ' + responseText);
      }
      return (response.json());
    });
  }

  function createBQTable(tokenInfo) {
    if (!tokenInfo.access_token) {
      return Promise.reject('access_token not found in tokenInfo');
    }

    const tableResource = {
      tableReference: {
        projectId: PROJECT_ID,
        datasetId: DATASET_ID,
        tableId: cbmeta.system_key + '_forecast',
      },
      schema: {
        fields: [
          { name: 'date_time', type: 'TIMESTAMP', mode: 'NULLABLE' },
          { name: 'asset_type_id', type: 'STRING', mode: 'NULLABLE' },
          { name: 'asset_id', type: 'STRING', mode: 'NULLABLE' },
          { name: 'data', type: 'STRING', mode: 'NULLABLE' },
        ],
      },
    };

    return fetch("https://bigquery.googleapis.com/bigquery/v2/projects/" + PROJECT_ID + "/datasets/" + DATASET_ID + "/tables", {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + tokenInfo.access_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tableResource),
    }).then(function(response) {
      if (!response.ok) {
        return Promise.resolve(response.text());
      }
      return Promise.resolve('BigQuery forecasting table created!');
    }).catch(function(error) {
      return Promise.reject(error);
    });
  }

  function createExternalDB(secret) {
    return fetch('https://' + cbmeta.platform_url + '/api/v/4/external-db/' + cbmeta.system_key, {
      headers: {
        'ClearBlade-DevToken': req.userToken,
      },
      body: JSON.stringify({
        name: 'IAForecastingBQDB',
        dbtype: 'bigquery',
        credentials: {
          authentication_type: 'json',
          dbtype: 'bigquery',
          project_id: 'clearblade-ipm',
          credentials: JSON.stringify(secret),
        },
      }),
      method: 'POST',
    })
      .then(function(response) {
        if (!response.ok) {
          return Promise.reject(response.text());
        }
        return Promise.resolve('External forecasting DB created!');
      })
      .catch(function(error) {
        return Promise.reject(error);
      });
  }

  function createBucketSet(secret) {
    return fetch('https://' + cbmeta.platform_url + '/api/v/4/bucket_sets/' + cbmeta.system_key, {
      headers: {
        'ClearBlade-DevToken': req.userToken,
      },
      body: JSON.stringify({
        name: 'ia-forecasting',
        platform_storage: 'google',
        edge_storage: 'local',
        platform_config: {
          bucket_name: 'clearblade-predictive-forecasting',
          credentials: secret,
        },
        edge_config: {
          root: '/tmp/clearblade_forecasting_buckets',
        },
      }),
      method: 'POST',
    })
      .then(function(response) {
        if (!response.ok) {
          return Promise.reject(response.text());
        }
        return Promise.resolve('Forecasting bucket set created!');
      })
      .catch(function(error) {
        return Promise.reject(error);
      });
  }

  function createBQConnectors(secret) {
    return createBQConnectCollection(secret).then(function(collectionId) {
      return Promise.all([createBatchConnector(), createCollectionConnector(collectionId)]);
    }).catch(function(error) {
      log('MQTT connector setup failed:', error);
      return Promise.resolve('MQTT connectors skipped - may need manual setup');
    });
  }

  function createBQConnectCollection(secret) {
    return fetch('https://' + cbmeta.platform_url + '/api/v/3/collectionmanagement', {
      method: 'POST',
      headers: {
        'ClearBlade-DevToken': req.userToken,
        'ClearBlade-SystemKey': cbmeta.system_key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        appid: cbmeta.system_key,
        dbtype: 'bigquery',
        is_hypertable: false,
        dbname: 'asset_history_migration',
        name: 'bq_asset_history',
        tablename: PROJECT_ID + '.' + DATASET_ID + '.' + cbmeta.system_key + '_forecast',
        authentication_type: 'json',
        project_id: PROJECT_ID,
        credentials: JSON.stringify(secret),
      }),
    }).then(function(response) {
      if (response.ok) {
        return response.json().then(function(result) {
          return result.collectionID;
        });
      } else {
        var responseText = response.text();
        
        if (typeof responseText === 'string') {
          var errorData;
          try {
            errorData = JSON.parse(responseText);
          } catch (parseError) {
            throw new Error('Failed to create BQ connect collection (unparseable response): ' + responseText);
          }
          
          if (errorData && errorData.error && errorData.error.message && errorData.error.message.indexOf('already exists') !== -1) {
            return getBQConnectCollectionId();
          }
          throw new Error('Failed to create BQ connect collection: ' + JSON.stringify(errorData));
        } else {
          return responseText.then(function(textContent) {
            var errorData;
            try {
              errorData = JSON.parse(textContent);
            } catch (parseError) {
              throw new Error('Failed to create BQ connect collection (unparseable response): ' + textContent);
            }
            
            if (errorData && errorData.error && errorData.error.message && errorData.error.message.indexOf('already exists') !== -1) {
              return getBQConnectCollectionId();
            }
            throw new Error('Failed to create BQ connect collection: ' + JSON.stringify(errorData));
          }).catch(function(textError) {
            throw new Error('Failed to create BQ connect collection (response read error): ' + textError.message);
          });
        }
      }
    }).catch(function(fetchError) {
      throw fetchError;
    });
  }

  function getBQConnectCollectionId() {
    return fetch('https://' + cbmeta.platform_url + '/admin/allcollections?appid=' + cbmeta.system_key, {
      method: 'GET',
      headers: {
        'Clearblade-Devtoken': req.userToken,
      }
    }).then(function(response) {
      if (!response.ok) {
        throw new Error('Failed to get collections: ' + response.status + ' ' + response.statusText);
      }
      
      var jsonResponse = response.json();
      if (typeof jsonResponse === 'string') {
        return JSON.parse(jsonResponse);
      } else {
        return jsonResponse;
      }
    }).then(function(collections) {
      if (!Array.isArray(collections)) {
        throw new Error('Collections response is not an array: ' + typeof collections);
      }
      
      var foundCollection = collections.find(function(collection) {
        return collection.name === 'bq_asset_history';
      });
      
      if (foundCollection) {
        return foundCollection.collectionID;
      }
      
      throw new Error('BQ connect collection not found in ' + collections.length + ' collections');
    }).catch(function(error) {
      throw new Error('Cannot retrieve existing collection ID due to API error: ' + error.message);
    });
  }

  function createBatchConnector() {
    return fetch('https://' + cbmeta.platform_url + '/api/v/1/mqtt-connectors/' + cbmeta.system_key + '/asset-history-batch', {
      method: 'POST',
      headers: {
        'ClearBlade-DevToken': req.userToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'asset-history-batch',
        type: 'batch',
        config: {
          batchOptions: {
            max_batch_size: 1000,
            max_batch_delay_seconds: 30,
            batch_channel_size: 10000,
          },
          topics: {
            'asset-history/raw': 'asset-history/batched'
          }
        },
        credentials: {}
      })
    }).then(function(response) {
      if (!response.ok) {
        return Promise.reject(response.text());
      }
      return Promise.resolve('Batch connector created!');
    });
  }

  function createCollectionConnector(collectionId) {
    return fetch('https://' + cbmeta.platform_url + '/api/v/1/mqtt-connectors/' + cbmeta.system_key + '/asset-history-collection', {
      method: 'POST',
      headers: {
        'ClearBlade-DevToken': req.userToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'asset-history-collection',
        type: 'collection',
        config: {
          collection_id: collectionId,
          topics: ['asset-history/batched'],
          column_mapping: {
            payload: 'data',
            message_properties: {
              'asset_type_id': 'asset_type_id',
              'asset_id': 'asset_id',
              'change_date': 'date_time'
            }
          },
          payload_encoding: 'utf8'
        },
        credentials: {}
      })
    }).then(function(response) {
      if (!response.ok) {
        return Promise.reject(response.text());
      }
      return Promise.resolve('Collection connector created!');
    });
  }
}
