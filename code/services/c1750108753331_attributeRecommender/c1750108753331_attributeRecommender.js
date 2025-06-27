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

function c1750108753331_attributeRecommender(req, resp) {  
  const cache = ClearBladeAsync.Cache('AccessTokenCache');
  const PROJECT_ID = 'clearblade-ipm';
  const LOCATION_ID = 'us-central1';
  const API_ENDPOINT = 'aiplatform.googleapis.com';
  const MODEL_ID = 'gemini-2.0-flash-lite-001';
  const GENERATE_CONTENT_API = 'generateContent';

  const params = req.params;
  const attributes = params.attributes;

  if (!attributes) {
    resp.error("Attributes missing in params");
  }

  function getAccessToken() {
    return cache.get('google-vertex-ai-config')
  }

  function extractResponse(data) {
    if (data.candidates && data.candidates.length === 1) {
      const candidate = data.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        return JSON.parse(candidate.content.parts[0].text);
      } else {
        // Handle the case where no content was returned
        return { attributes_to_predict: [], supporting_attributes: [] }
      }
    }

    return { attributes_to_predict: [], supporting_attributes: [] }
  }

  function sendPromptToLLM(token) {
    return fetch('https://' + LOCATION_ID + '-' + API_ENDPOINT + '/v1/projects/' + PROJECT_ID + '/locations/' + LOCATION_ID + '/publishers/google/models/' + MODEL_ID + ':' + GENERATE_CONTENT_API, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: attributes.join(', ')
              },
            ],
          },
        ],
        systemInstruction: {
          parts: [
            {
              text: "You're building a multi-variate forecasting model and users will give you a list of attributes. From the list of attribute, select the ones you believe would be most relevant for forecasting. Remember forecasting needs time based features so omit any features that are not time-based. Also, consider features that are typically cyclical or follow a pattern and not linear. Out of the selected features, break down the selected features into attributes_to_predict and supporting_attributes. attributes_to_predict will have the critical features that are the most important for the user and can be used to detect anomalies and supporting_attributes are less critical features that might influence the attributes_to_predict.",
            },
          ],
        },
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 8192,
          temperature: 1, //0.2
          topP: 1,
          responseSchema: {"type":"OBJECT","properties":{"attributes_to_predict":{"type":"ARRAY","items":{"type":"STRING"}},"supporting_attributes":{"type":"ARRAY","items":{"type":"STRING"}},"attributes_to_predict_reasoning":{"type":"STRING"},"supporting_attributes_reasoning":{"type":"STRING"}}}
        },
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'OFF',
          },
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'OFF',
          },
        ],
      }),
    }).then(function(response) {
      if (!response.ok) {
        const message = "Error calling LLM API: " + response.text();
        resp.error(message)
      }
      return response.json();
    }).then(function(data) {
      return extractResponse(data);
    })
  }

  getAccessToken().then(function(data){
    if (!data || !data.accessToken) {
      resp.error("Cannot send message to the LLM. AccessToken missing from the system.")
      // resp.success({'attributes_to_predict': [], 'supporting_attributes': []});
    }
    return sendPromptToLLM(data.accessToken);
  }).then(function(response){
    resp.success(response);
  }).catch(function(err) {
    resp.error(err);
  })

}
