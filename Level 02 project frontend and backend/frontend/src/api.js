/**
 * Every network call in the app lives here. Components never call fetch.
 *
 * Each function returns parsed JSON, or throws an ApiError carrying enough
 * information for the UI to react differently to the three failure modes that
 * need completely different fixes:
 *
 *   - network  : the backend is not running / unreachable  -> start Flask
 *   - 4xx      : the payload was wrong                     -> fix the form
 *   - 5xx      : the model pipeline blew up                -> backend problem
 */

const BASE_URL = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, { status = null, details = null, isNetwork = false } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
    this.isNetwork = isNetwork
  }
}

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${BASE_URL}${path}`, options)
  } catch {
    // fetch only rejects on transport failure: DNS, refused connection, CORS
    // preflight rejection. Never on a 4xx/5xx.
    throw new ApiError(`Could not reach the API at ${BASE_URL}.`, { isNetwork: true })
  }

  let body = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  if (!response.ok) {
    const message =
      (body && (body.error || body.message)) || `Request failed with status ${response.status}.`
    throw new ApiError(message, {
      status: response.status,
      details: body ? (body.details ?? body.hint ?? null) : null,
    })
  }

  if (body === null) {
    throw new ApiError('The API returned a response that was not valid JSON.', {
      status: response.status,
    })
  }

  return body
}

/** GET /health -- used on mount to drive the status dot. */
export function getHealth() {
  return request('/health')
}

/** GET /schema -- categorical options straight from the fitted encoder. */
export function getSchema() {
  return request('/schema')
}

/**
 * POST /predict
 * @param {object} payload exactly the 14 required fields, already type-coerced.
 */
export function predictFare(payload) {
  return request('/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export { BASE_URL }
