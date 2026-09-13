/**
 * Static data: fallback dropdown values, preset trips, and display lookups.
 */

/**
 * Used only when GET /schema fails. The live encoder is the source of truth --
 * these exist so the form is still usable if the schema call is the one thing
 * that breaks.
 *
 * rate_regime is deliberately absent: it is engineered server-side from the
 * coordinates and must never appear in the form or the payload.
 */
export const FALLBACK_CATEGORIES = {
  pickup_borough: ['Bronx', 'Brooklyn', 'Manhattan', 'New Jersey', 'Queens', 'Staten Island'],
  dropoff_borough: ['Bronx', 'Brooklyn', 'Manhattan', 'New Jersey', 'Queens', 'Staten Island'],
  weather_condition: ['Clear', 'Cloudy', 'Fog', 'Rain', 'Snow'],
}

/** The backend treats anything outside 1-6 as missing, so offer only 1-6. */
export const PASSENGER_OPTIONS = [1, 2, 3, 4, 5, 6]

/** Roughly the NYC metro bounding box. Used for warnings, never to block. */
export const NYC_BOUNDS = {
  lat: { min: 40.4, max: 41.0 },
  lon: { min: -74.3, max: -73.7 },
}

/** Mean absolute error of the deployed model, in dollars. */
export const MODEL_MAE = 4.57

/**
 * Complete known-good trips, one per pricing regime the model distinguishes.
 * Stored in form-state shape: strings, and pickup_datetime in the
 * `datetime-local` format. buildPayload() converts both on submit.
 */
export const PRESETS = [
  {
    id: 'jfk',
    label: 'JFK → Manhattan',
    note: 'Airport flat fare',
    values: {
      pickup_latitude: '40.6413',
      pickup_longitude: '-73.7781',
      pickup_borough: 'Queens',
      dropoff_latitude: '40.7580',
      dropoff_longitude: '-73.9855',
      dropoff_borough: 'Manhattan',
      passenger_count: '1',
      pickup_datetime: '2023-10-27T14:30',
      is_holiday: false,
      weather_condition: 'Clear',
      temperature_f: '65',
      precipitation_in: '0.0',
      wind_speed_mph: '5.0',
      traffic_index: '2.0',
    },
  },
  {
    id: 'manhattan-brooklyn',
    label: 'Manhattan → Brooklyn',
    note: 'Metered, rush hour rain',
    values: {
      pickup_latitude: '40.7580',
      pickup_longitude: '-73.9855',
      pickup_borough: 'Manhattan',
      dropoff_latitude: '40.6782',
      dropoff_longitude: '-73.9442',
      dropoff_borough: 'Brooklyn',
      passenger_count: '2',
      pickup_datetime: '2023-06-15T08:15',
      is_holiday: false,
      weather_condition: 'Rain',
      temperature_f: '48',
      precipitation_in: '0.3',
      wind_speed_mph: '12.0',
      traffic_index: '7.5',
    },
  },
  {
    id: 'newark',
    label: 'Newark → Manhattan',
    note: 'Newark surcharge',
    values: {
      pickup_latitude: '40.6895',
      pickup_longitude: '-74.1745',
      pickup_borough: 'New Jersey',
      dropoff_latitude: '40.7580',
      dropoff_longitude: '-73.9855',
      dropoff_borough: 'Manhattan',
      passenger_count: '1',
      pickup_datetime: '2023-08-02T19:45',
      is_holiday: false,
      weather_condition: 'Clear',
      temperature_f: '70',
      precipitation_in: '0.0',
      wind_speed_mph: '6.0',
      traffic_index: '3.0',
    },
  },
  {
    id: 'lga',
    label: 'LaGuardia → Manhattan',
    note: 'Metered, snow',
    values: {
      pickup_latitude: '40.7769',
      pickup_longitude: '-73.8740',
      pickup_borough: 'Queens',
      dropoff_latitude: '40.7736',
      dropoff_longitude: '-73.9566',
      dropoff_borough: 'Manhattan',
      passenger_count: '3',
      pickup_datetime: '2023-02-14T08:20',
      is_holiday: false,
      weather_condition: 'Snow',
      temperature_f: '28',
      precipitation_in: '0.8',
      wind_speed_mph: '17.0',
      traffic_index: '8.9',
    },
  },
]

/** Empty form. Sensible neutral defaults for the fields that have one. */
export const EMPTY_FORM = {
  pickup_latitude: '',
  pickup_longitude: '',
  pickup_borough: 'Manhattan',
  dropoff_latitude: '',
  dropoff_longitude: '',
  dropoff_borough: 'Manhattan',
  passenger_count: '1',
  pickup_datetime: '',
  is_holiday: false,
  weather_condition: 'Clear',
  temperature_f: '',
  precipitation_in: '',
  wind_speed_mph: '',
  traffic_index: '5',
}

/**
 * One colour per pricing regime so the four are distinguishable at a glance.
 * Keys match trip_details.rate_regime; classes are written out in full because
 * Tailwind only ships classes it can see in the source.
 */
export const REGIME_STYLES = {
  1: {
    chip: 'bg-sky-500/12 text-sky-300 ring-sky-400/30',
    dot: 'bg-sky-400',
  },
  2: {
    chip: 'bg-accent/12 text-accent-soft ring-accent/35',
    dot: 'bg-accent',
  },
  3: {
    chip: 'bg-violet-500/12 text-violet-300 ring-violet-400/30',
    dot: 'bg-violet-400',
  },
  4: {
    chip: 'bg-emerald-500/12 text-emerald-300 ring-emerald-400/30',
    dot: 'bg-emerald-400',
  },
}

export const REGIME_FALLBACK_STYLE = {
  chip: 'bg-ink-700/60 text-ink-300 ring-ink-600',
  dot: 'bg-ink-400',
}
