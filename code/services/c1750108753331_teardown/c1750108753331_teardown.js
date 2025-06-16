/**
 * Type: Micro Service
 * Description: Teardown action service for cleaning up any resources created in the setup service
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

function c1750108753331_teardown(req, resp) {
  const params = req.params;
  //component teardown behavior here. Undo any setup done in the setup service
  resp.success('Success');
}