/**
 * Type: Micro Service
 * Description: Disable action service for disabling the IA entities 
 * Runs as: IA User
 * @param {CbServer.BasicReq} req
 * @param {string} req.systemKey
 * @param {string} req.systemSecret
 * @param {string} req.userEmail
 * @param {string} req.userid
 * @param {string} req.userToken
 * @param {boolean} req.isLogging
 * @param {CbServer.Resp} resp
 */

function {{component_prefix}}_disable(req, resp) {
  /** @type {entity_id: string, component_id: string, mfe_settings: Record<string, unknown>} */
  const params = req.params;
  const mfe_settings = params.mfe_settings;
  console.log('mfe_settings: ', mfe_settings);
  //component disable behavior here. Disable the component resources
  resp.success('Success');
}