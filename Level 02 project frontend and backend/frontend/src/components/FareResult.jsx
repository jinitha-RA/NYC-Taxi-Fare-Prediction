import { MODEL_MAE, REGIME_FALLBACK_STYLE, REGIME_STYLES } from '../constants'

function Chip({ className, children }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {children}
    </span>
  )
}

export default function FareResult({ result }) {
  const details = result.trip_details || {}
  const regime = details.rate_regime
  const style = REGIME_STYLES[regime] || REGIME_FALLBACK_STYLE

  const fare = Number(result.predicted_fare)
  const miles = Number(details.haversine_miles)

  return (
    <div
      className="animate-rise rounded-2xl border border-ink-700 bg-ink-900 p-6"
      role="status"
      aria-live="polite"
    >
      <p className="text-xs tracking-[0.14em] text-ink-500 uppercase">Estimated fare</p>

      <p className="mt-2 flex items-baseline gap-1 font-semibold text-accent tabular-nums">
        <span className="text-3xl leading-none">$</span>
        <span className="text-5xl leading-none tracking-tight">
          {Number.isFinite(fare) ? fare.toFixed(2) : '—'}
        </span>
        <span className="ml-1 self-end text-sm font-normal text-ink-500">
          {result.currency || 'USD'}
        </span>
      </p>

      <p className="mt-2.5 text-sm text-ink-400">
        Typically within{' '}
        <span className="font-medium text-ink-300">±${MODEL_MAE.toFixed(2)}</span>
      </p>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-ink-800 pt-5">
        {details.rate_regime_name && (
          <Chip className={style.chip}>
            <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
            {details.rate_regime_name}
          </Chip>
        )}

        {Number.isFinite(miles) && (
          <Chip className="bg-ink-800 text-ink-300 ring-ink-700">{miles.toFixed(2)} mi</Chip>
        )}

        {details.is_airport === true && (
          <Chip className="bg-ink-800 text-ink-300 ring-ink-700">Airport trip</Chip>
        )}

        {details.cross_borough === true && (
          <Chip className="bg-ink-800 text-ink-300 ring-ink-700">Cross-borough</Chip>
        )}
      </div>

      <p className="mt-5 text-xs leading-relaxed text-ink-500">
        A point estimate from{' '}
        <span className="text-ink-400">{result.model || 'the model'}</span>, based on route,
        time, weather and traffic. Negotiated fares leave no geographic signature, so the model
        cannot predict them.
      </p>
    </div>
  )
}
