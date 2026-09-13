import { PASSENGER_OPTIONS } from '../constants'

function Section({ title, step, description, children }) {
  return (
    <section className="rounded-2xl border border-ink-800 bg-ink-900/60 p-5 sm:p-6">
      <header className="mb-5 flex items-start gap-3">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink-800 text-xs font-medium text-ink-400">
          {step}
        </span>
        <div>
          <h3 className="text-sm font-medium text-ink-200">{title}</h3>
          <p className="mt-0.5 text-xs text-ink-500">{description}</p>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function Field({ id, label, hint, error, warning, span = false, children }) {
  return (
    <div className={span ? 'sm:col-span-2' : ''}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-ink-300">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      ) : warning ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-amber-400/90">
          {warning}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function TripForm({
  values,
  errors,
  warnings,
  categories,
  loading,
  onChange,
  onSubmit,
}) {
  // One handler shape for every text / select / range control.
  const set = (name) => (event) => onChange(name, event.target.value)

  const inputProps = (name, extra = '') => ({
    id: name,
    name,
    value: values[name],
    onChange: set(name),
    disabled: loading,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] || warnings[name] ? `${name}-error` : undefined,
    className: `control${errors[name] ? ' control--invalid' : ''}${extra ? ` ${extra}` : ''}`,
  })

  const traffic = Number(values.traffic_index) || 1

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section step="1" title="Pickup" description="Where the trip starts.">
          <Field
            id="pickup_latitude"
            label="Latitude"
            hint="40.4 to 41.0"
            error={errors.pickup_latitude}
            warning={warnings.pickup_latitude}
          >
            <input
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="40.6413"
              {...inputProps('pickup_latitude')}
            />
          </Field>

          <Field
            id="pickup_longitude"
            label="Longitude"
            hint="-74.3 to -73.7"
            error={errors.pickup_longitude}
            warning={warnings.pickup_longitude}
          >
            <input
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="-73.7781"
              {...inputProps('pickup_longitude')}
            />
          </Field>

          <Field id="pickup_borough" label="Borough" span error={errors.pickup_borough}>
            <select {...inputProps('pickup_borough', 'control--pin')}>
              {categories.pickup_borough.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        <Section step="2" title="Dropoff" description="Where the trip ends.">
          <Field
            id="dropoff_latitude"
            label="Latitude"
            hint="40.4 to 41.0"
            error={errors.dropoff_latitude}
            warning={warnings.dropoff_latitude}
          >
            <input
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="40.7580"
              {...inputProps('dropoff_latitude')}
            />
          </Field>

          <Field
            id="dropoff_longitude"
            label="Longitude"
            hint="-74.3 to -73.7"
            error={errors.dropoff_longitude}
            warning={warnings.dropoff_longitude}
          >
            <input
              type="number"
              step="any"
              inputMode="decimal"
              placeholder="-73.9855"
              {...inputProps('dropoff_longitude')}
            />
          </Field>

          <Field id="dropoff_borough" label="Borough" span error={errors.dropoff_borough}>
            <select {...inputProps('dropoff_borough', 'control--pin')}>
              {categories.dropoff_borough.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        </Section>

        <Section step="3" title="Trip" description="Who is riding, and when.">
          <Field id="passenger_count" label="Passengers" error={errors.passenger_count}>
            <select {...inputProps('passenger_count')}>
              {PASSENGER_OPTIONS.map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </Field>

          <Field id="pickup_datetime" label="Pickup date and time" error={errors.pickup_datetime}>
            <input type="datetime-local" {...inputProps('pickup_datetime')} />
          </Field>

          <div className="sm:col-span-2">
            <label
              htmlFor="is_holiday"
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-700 bg-ink-850 p-3 transition-colors hover:border-ink-600 has-[:focus-visible]:border-accent"
            >
              <input
                id="is_holiday"
                name="is_holiday"
                type="checkbox"
                checked={values.is_holiday}
                disabled={loading}
                onChange={(event) => onChange('is_holiday', event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
              />
              <span>
                <span className="block text-xs font-medium text-ink-300">Public holiday</span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  Holiday traffic patterns differ from a normal weekday.
                </span>
              </span>
            </label>
          </div>
        </Section>

        <Section step="4" title="Conditions" description="Weather and roads at pickup time.">
          <Field id="weather_condition" label="Weather" span error={errors.weather_condition}>
            <select {...inputProps('weather_condition')}>
              {categories.weather_condition.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>

          <Field id="temperature_f" label="Temperature (F)" error={errors.temperature_f}>
            <input
              type="number"
              step="0.1"
              inputMode="decimal"
              placeholder="65"
              {...inputProps('temperature_f')}
            />
          </Field>

          <Field id="precipitation_in" label="Precipitation (in)" error={errors.precipitation_in}>
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0.0"
              {...inputProps('precipitation_in')}
            />
          </Field>

          <Field id="wind_speed_mph" label="Wind speed (mph)" error={errors.wind_speed_mph}>
            <input
              type="number"
              step="0.1"
              min="0"
              inputMode="decimal"
              placeholder="5.0"
              {...inputProps('wind_speed_mph')}
            />
          </Field>

          <div className="sm:col-span-2">
            <div className="mb-2 flex items-baseline justify-between">
              <label htmlFor="traffic_index" className="text-xs font-medium text-ink-300">
                Traffic index
              </label>
              <span className="text-sm font-medium text-accent tabular-nums">
                {traffic.toFixed(1)}
              </span>
            </div>
            <input
              id="traffic_index"
              name="traffic_index"
              type="range"
              min="1"
              max="10"
              step="0.1"
              value={values.traffic_index}
              onChange={set('traffic_index')}
              disabled={loading}
              className="slider"
            />
            <div className="mt-1.5 flex justify-between text-xs text-ink-500">
              <span>1 - free-flowing</span>
              <span>10 - gridlock</span>
            </div>
          </div>
        </Section>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="focus-accent flex w-full items-center justify-center gap-2.5 rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-ink-950 transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:bg-accent/50 disabled:text-ink-950/60"
      >
        {loading && <Spinner />}
        {loading ? 'Estimating...' : 'Estimate fare'}
      </button>
    </form>
  )
}
