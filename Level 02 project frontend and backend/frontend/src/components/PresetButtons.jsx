import { PRESETS } from '../constants'

export default function PresetButtons({ activeId, onApply, onClear, disabled }) {
  return (
    <section aria-labelledby="presets-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="presets-heading" className="text-sm font-medium text-ink-200">
          Quick start
        </h2>
        <p className="text-xs text-ink-500">
          Each preset exercises a different pricing regime in the model.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {PRESETS.map((preset) => {
          const active = preset.id === activeId
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => onApply(preset)}
              aria-pressed={active}
              className={`focus-accent group rounded-xl border px-4 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                active
                  ? 'border-accent/60 bg-accent/8 shadow-[0_0_0_1px_rgba(245,165,36,0.25)]'
                  : 'border-ink-700 bg-ink-850 hover:border-ink-600 hover:bg-ink-800'
              }`}
            >
              <span
                className={`block text-sm font-medium ${
                  active ? 'text-accent-soft' : 'text-ink-200'
                }`}
              >
                {preset.label}
              </span>
              <span className="mt-0.5 block text-xs text-ink-500">{preset.note}</span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onClear}
        disabled={disabled}
        className="focus-accent mt-3 rounded-md text-xs text-ink-500 underline-offset-4 transition-colors hover:text-ink-300 hover:underline disabled:opacity-50"
      >
        Clear the form
      </button>
    </section>
  )
}
