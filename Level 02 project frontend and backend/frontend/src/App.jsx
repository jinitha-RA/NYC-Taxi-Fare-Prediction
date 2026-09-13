import { useCallback, useEffect, useState } from 'react'
import { BASE_URL, getHealth, getSchema, predictFare } from './api'
import {
  EMPTY_FORM,
  FALLBACK_CATEGORIES,
  MODEL_MAE,
  NYC_BOUNDS,
  PASSENGER_OPTIONS,
} from './constants'
import FareResult from './components/FareResult'
import PresetButtons from './components/PresetButtons'
import StatusIndicator from './components/StatusIndicator'
import TripForm from './components/TripForm'

/** The exact 14 fields the API accepts. rate_regime is engineered server-side. */
const API_FIELDS = [
  'pickup_latitude',
  'pickup_longitude',
  'dropoff_latitude',
  'dropoff_longitude',
  'pickup_borough',
  'dropoff_borough',
  'passenger_count',
  'weather_condition',
  'temperature_f',
  'precipitation_in',
  'wind_speed_mph',
  'traffic_index',
  'is_holiday',
  'pickup_datetime',
]

const NUMERIC_LABELS = {
  pickup_latitude: 'Pickup latitude',
  pickup_longitude: 'Pickup longitude',
  dropoff_latitude: 'Dropoff latitude',
  dropoff_longitude: 'Dropoff longitude',
  temperature_f: 'Temperature',
  precipitation_in: 'Precipitation',
  wind_speed_mph: 'Wind speed',
  traffic_index: 'Traffic index',
}

/**
 * `datetime-local` yields "2023-10-27T14:30" (or "...T14:30:45" in some
 * browsers). The API wants "YYYY-MM-DD HH:MM:SS". Getting this wrong is a 400.
 */
function toApiDatetime(value) {
  if (!value) return ''
  const swapped = value.replace('T', ' ')
  const time = swapped.split(' ')[1] || ''
  return time.split(':').length === 2 ? `${swapped}:00` : swapped
}

/** React inputs hand back strings; the API rejects "40.6413" as a string. */
function buildPayload(values) {
  return {
    pickup_latitude: parseFloat(values.pickup_latitude),
    pickup_longitude: parseFloat(values.pickup_longitude),
    dropoff_latitude: parseFloat(values.dropoff_latitude),
    dropoff_longitude: parseFloat(values.dropoff_longitude),
    pickup_borough: values.pickup_borough,
    dropoff_borough: values.dropoff_borough,
    passenger_count: parseFloat(values.passenger_count),
    weather_condition: values.weather_condition,
    temperature_f: parseFloat(values.temperature_f),
    precipitation_in: parseFloat(values.precipitation_in),
    wind_speed_mph: parseFloat(values.wind_speed_mph),
    traffic_index: parseFloat(values.traffic_index),
    is_holiday: values.is_holiday ? 1 : 0,
    pickup_datetime: toApiDatetime(values.pickup_datetime),
  }
}

/**
 * Errors block submission. Warnings do not -- out-of-box coordinates still go
 * through, because the backend has its own repair logic for transposed and
 * zeroed coordinates and may well know better than we do.
 */
function validateTrip(values) {
  const errors = {}
  const warnings = {}

  const readNumber = (name) => {
    const raw = values[name]
    if (raw === '' || raw === null || raw === undefined) {
      errors[name] = `${NUMERIC_LABELS[name]} is required.`
      return NaN
    }
    const parsed = parseFloat(raw)
    if (Number.isNaN(parsed)) {
      errors[name] = `${NUMERIC_LABELS[name]} must be a number.`
      return NaN
    }
    return parsed
  }

  const coords = {
    pickup_latitude: readNumber('pickup_latitude'),
    pickup_longitude: readNumber('pickup_longitude'),
    dropoff_latitude: readNumber('dropoff_latitude'),
    dropoff_longitude: readNumber('dropoff_longitude'),
  }

  for (const [name, value] of Object.entries(coords)) {
    if (!Number.isFinite(value)) continue
    const axis = name.endsWith('latitude') ? 'lat' : 'lon'
    const { min, max } = NYC_BOUNDS[axis]
    if (value < min || value > max) {
      warnings[name] = `Outside the NYC area (${min.toFixed(1)} to ${max.toFixed(1)}). You can still submit.`
    }
  }

  const temperature = readNumber('temperature_f')
  if (Number.isFinite(temperature) && (temperature < -30 || temperature > 130)) {
    warnings.temperature_f = 'That is well outside anything NYC has recorded.'
  }

  const precipitation = readNumber('precipitation_in')
  if (Number.isFinite(precipitation) && precipitation < 0) {
    errors.precipitation_in = 'Precipitation cannot be negative.'
  }

  const wind = readNumber('wind_speed_mph')
  if (Number.isFinite(wind) && wind < 0) {
    errors.wind_speed_mph = 'Wind speed cannot be negative.'
  }

  const traffic = readNumber('traffic_index')
  if (Number.isFinite(traffic) && (traffic < 1 || traffic > 10)) {
    errors.traffic_index = 'Traffic index runs from 1 to 10.'
  }

  const passengers = parseInt(values.passenger_count, 10)
  if (!PASSENGER_OPTIONS.includes(passengers)) {
    errors.passenger_count = 'Choose between 1 and 6 passengers.'
  }

  if (!values.pickup_datetime) {
    errors.pickup_datetime = 'Pickup date and time is required.'
  } else if (Number.isNaN(Date.parse(values.pickup_datetime))) {
    errors.pickup_datetime = 'That is not a valid date and time.'
  }

  if (!values.pickup_borough) errors.pickup_borough = 'Pickup borough is required.'
  if (!values.dropoff_borough) errors.dropoff_borough = 'Dropoff borough is required.'
  if (!values.weather_condition) errors.weather_condition = 'Weather is required.'

  return { errors, warnings }
}

/**
 * Split the backend's `details` into per-field messages where a field name is
 * recognisable, and leftover text for the banner.
 */
function splitServerDetails(message, details) {
  const lines = Array.isArray(details)
    ? details.map(String)
    : details
      ? [String(details)]
      : []
  // The top-level message is scanned for a field name too, but never echoed
  // into `unmatched` -- it is already the banner's title.
  const candidates = message ? [String(message), ...lines] : lines
  const titleLine = message ? String(message) : null

  const fieldErrors = {}
  const unmatched = []

  for (const line of candidates) {
    const missing = line.match(/Missing required field\(s\):\s*(.+)/i)
    if (missing) {
      const named = missing[1]
        .split(',')
        .map((part) => part.trim())
        .filter((part) => API_FIELDS.includes(part))
      if (named.length) {
        named.forEach((field) => {
          fieldErrors[field] = 'The API did not receive this field.'
        })
        continue
      }
    }

    const field = API_FIELDS.find((name) => line.includes(name))
    if (field) {
      fieldErrors[field] = line
    } else if (line !== titleLine) {
      unmatched.push(line)
    }
  }

  return { fieldErrors, unmatched }
}

/** Keep only the dropdowns we render. rate_regime is deliberately ignored. */
function normalizeCategories(schema) {
  const next = { ...FALLBACK_CATEGORIES }
  const fetched = schema && schema.categories
  if (!fetched) return next
  for (const key of Object.keys(FALLBACK_CATEGORIES)) {
    if (Array.isArray(fetched[key]) && fetched[key].length > 0) {
      next[key] = fetched[key]
    }
  }
  return next
}

function Banner({ tone, title, children }) {
  const tones = {
    error: 'border-red-500/35 bg-red-500/8 text-red-200',
    warning: 'border-amber-500/35 bg-amber-500/8 text-amber-200',
  }
  return (
    <div className={`animate-rise rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-1.5 text-xs leading-relaxed opacity-90">{children}</div>
    </div>
  )
}

export default function App() {
  const [health, setHealth] = useState({ status: 'checking', model: null })
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES)
  const [values, setValues] = useState(EMPTY_FORM)
  const [activePreset, setActivePreset] = useState(null)
  const [clientErrors, setClientErrors] = useState({})
  const [serverFieldErrors, setServerFieldErrors] = useState({})
  const [requestError, setRequestError] = useState(null)
  const [result, setResult] = useState(null)
  const [resultSeq, setResultSeq] = useState(0)
  const [loading, setLoading] = useState(false)

  const { warnings } = validateTrip(values)
  const errors = { ...clientErrors, ...serverFieldErrors }
  const coordinateWarnings = Object.keys(warnings).filter((name) => name.includes('itude'))

  const runHealthCheck = useCallback(
    () =>
      getHealth()
        .then((data) =>
          setHealth({ status: data.status === 'ok' ? 'ok' : 'down', model: data.model }),
        )
        .catch(() => setHealth({ status: 'down', model: null })),
    [],
  )

  // Recheck flips to 'checking' first so the button gives immediate feedback;
  // on mount that is already the initial state, so the effect skips it.
  const handleRecheck = useCallback(() => {
    setHealth((prev) => ({ ...prev, status: 'checking' }))
    runHealthCheck()
  }, [runHealthCheck])

  useEffect(() => {
    runHealthCheck()
  }, [runHealthCheck])

  useEffect(() => {
    getSchema()
      .then((schema) => {
        const next = normalizeCategories(schema)
        setCategories(next)
        // If the encoder was refitted with different categories, a default we
        // are holding may no longer be selectable. Snap it to a real option.
        setValues((current) => {
          const patched = { ...current }
          for (const [field, options] of Object.entries(next)) {
            if (!options.includes(patched[field])) patched[field] = options[0]
          }
          return patched
        })
      })
      .catch(() => {
        // Fallback lists are already in state -- the form stays usable.
      })
  }, [])

  const handleChange = (name, value) => {
    setValues((current) => ({ ...current, [name]: value }))
    setActivePreset(null)
    // A server complaint about a field stops being true the moment it is edited.
    setServerFieldErrors((current) => {
      if (!current[name]) return current
      const next = { ...current }
      delete next[name]
      return next
    })
    setClientErrors((current) => {
      if (!current[name]) return current
      const next = { ...current }
      delete next[name]
      return next
    })
  }

  const applyPreset = (preset) => {
    setValues(preset.values)
    setActivePreset(preset.id)
    setClientErrors({})
    setServerFieldErrors({})
    setRequestError(null)
    setResult(null)
  }

  const clearForm = () => {
    setValues(EMPTY_FORM)
    setActivePreset(null)
    setClientErrors({})
    setServerFieldErrors({})
    setRequestError(null)
    setResult(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const { errors: found } = validateTrip(values)
    setClientErrors(found)
    setServerFieldErrors({})
    setRequestError(null)

    if (Object.keys(found).length > 0) {
      setResult(null)
      return
    }

    setLoading(true)
    try {
      const data = await predictFare(buildPayload(values))
      setResult(data)
      setResultSeq((n) => n + 1)
    } catch (error) {
      setResult(null)
      if (error.isNetwork) {
        setHealth({ status: 'down', model: null })
        setRequestError({ kind: 'network' })
      } else {
        const { fieldErrors, unmatched } = splitServerDetails(error.message, error.details)
        setServerFieldErrors(fieldErrors)
        setRequestError({
          kind: error.status >= 500 ? 'server' : 'request',
          status: error.status,
          message: error.message,
          lines: unmatched,
          hasFieldErrors: Object.keys(fieldErrors).length > 0,
        })
      }
    } finally {
      setLoading(false)
    }
  }

  const invalidCount = Object.keys(clientErrors).length

  return (
    <div className="min-h-screen bg-ink-950">
      <header className="sticky top-0 z-10 border-b border-ink-800 bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/12 text-sm font-bold text-accent"
              aria-hidden="true"
            >
              $
            </span>
            <div>
              <h1 className="text-sm font-semibold text-ink-200">NYC Taxi Fare Estimator</h1>
              <p className="text-xs text-ink-500">
                Random Forest regression · Test R² 0.9518 · MAE ${MODEL_MAE.toFixed(2)}
              </p>
            </div>
          </div>
          <StatusIndicator status={health.status} model={health.model} onRetry={handleRecheck} />
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        {health.status === 'down' && (
          <div className="mb-6">
            <Banner tone="error" title="The prediction API is not reachable">
              <p>
                Nothing at <code className="text-red-300">{BASE_URL}</code> answered. Start the
                Flask backend, then hit Recheck:
              </p>
              <pre className="mt-2 overflow-x-auto rounded-lg border border-red-500/25 bg-ink-950/70 px-3 py-2 text-[11px] text-ink-300">
                cd backend{'\n'}python app.py
              </pre>
            </Banner>
          </div>
        )}

        <div className="mb-8">
          <PresetButtons
            activeId={activePreset}
            onApply={applyPreset}
            onClear={clearForm}
            disabled={loading}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <TripForm
            values={values}
            errors={errors}
            warnings={warnings}
            categories={categories}
            loading={loading}
            onChange={handleChange}
            onSubmit={handleSubmit}
          />

          <aside className="xl:sticky xl:top-24 xl:self-start">
            <div className="space-y-4">
              {invalidCount > 0 && (
                <Banner
                  tone="error"
                  title={
                    invalidCount === 1
                      ? '1 field needs attention'
                      : `${invalidCount} fields need attention`
                  }
                >
                  The highlighted fields in the form need fixing before an estimate can be made.
                </Banner>
              )}

              {requestError?.kind === 'network' && (
                <Banner tone="error" title="Could not reach the API">
                  The request never left the browser. Check that Flask is running at{' '}
                  <code>{BASE_URL}</code>.
                </Banner>
              )}

              {requestError?.kind === 'request' && (
                <Banner tone="error" title={requestError.message}>
                  {requestError.lines.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-4">
                      {requestError.lines.map((line, index) => (
                        <li key={index}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      {requestError.hasFieldErrors
                        ? 'See the highlighted fields in the form.'
                        : 'The API rejected the request.'}
                    </p>
                  )}
                </Banner>
              )}

              {requestError?.kind === 'server' && (
                <Banner tone="error" title="The model failed to produce an estimate">
                  <p>
                    The request was accepted but the prediction pipeline errored. This is a backend
                    problem, not a form problem — check the Flask console.
                  </p>
                  {requestError.lines.length > 0 && (
                    <p className="mt-1.5 text-ink-400">{requestError.lines[0]}</p>
                  )}
                </Banner>
              )}

              {coordinateWarnings.length > 0 && !loading && (
                <Banner tone="warning" title="Coordinates look outside NYC">
                  The backend repairs transposed and zeroed coordinates on its own, so this will
                  still submit — but double-check the values first.
                </Banner>
              )}

              {result ? (
                <FareResult key={resultSeq} result={result} />
              ) : (
                !requestError && (
                  <div className="rounded-2xl border border-dashed border-ink-800 bg-ink-900/40 p-6">
                    <p className="text-sm text-ink-400">No estimate yet</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
                      Pick a preset above or fill in the four sections, then hit{' '}
                      <span className="text-ink-400">Estimate fare</span>. The result appears here.
                    </p>
                  </div>
                )
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
