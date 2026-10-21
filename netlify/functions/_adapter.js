'use strict';
// Adapt Netlify's event-based functions to the existing Node request/response API.
module.exports = (handler) => async (event) => {
  const headers = Object.fromEntries(Object.entries(event.headers || {}).map(([k,v]) => [k.toLowerCase(), v]));
  const req = {
    method: event.httpMethod || 'GET',
    headers,
    socket: { remoteAddress: headers['x-nf-client-connection-ip'] || 'unknown' },
    body: event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body) : '',
  };
  let statusCode = 200;
  const outHeaders = {};
  let body = '';
  const res = {
    get statusCode() { return statusCode; },
    set statusCode(v) { statusCode = v; },
    setHeader(k,v) { outHeaders[k] = String(v); },
    end(data) { body = data == null ? '' : String(data); },
  };
  await handler(req, res);
  return { statusCode, headers: outHeaders, body };
};
