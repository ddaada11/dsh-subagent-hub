/** Small HTTP helpers shared by the hub routes. */

/**
 * Write one JSON response and end it.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {unknown} payload
 */
export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

/**
 * Collect a request body and parse it as JSON. An empty body is `{}`.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readJson(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  const parsed = JSON.parse(text)
  if (parsed === null || typeof parsed !== 'object') throw new Error('请求体必须是 JSON 对象')
  return parsed
}
