/**
 * Type: Micro Service
 * Description: Setup action service for creating ClearBlade Entities that cannot be a part of the component repository (e.g. Secrets, External DBs, etc.)
 * Runs as: Developer
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

function {{component_prefix}}_setup(req, resp) {
  const params = req.params;
  //component setup behavior here initialize any external databases, bucket sets, etc.
  resp.success('Success');
}