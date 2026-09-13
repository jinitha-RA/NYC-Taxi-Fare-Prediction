const STATES = {
  checking: {
    dot: 'bg-ink-400',
    ping: false,
    label: 'Checking API',
    text: 'text-ink-400',
  },
  ok: {
    dot: 'bg-emerald-400',
    ping: true,
    label: 'API online',
    text: 'text-emerald-300',
  },
  down: {
    dot: 'bg-red-500',
    ping: false,
    label: 'API offline',
    text: 'text-red-300',
  },
}

export default function StatusIndicator({ status, model, onRetry }) {
  const state = STATES[status] || STATES.checking

  return (
    <div className="flex items-center gap-2.5 rounded-full border border-ink-700 bg-ink-850/80 py-1.5 pr-2 pl-3">
      <span className="relative flex h-2 w-2 shrink-0">
        {state.ping && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${state.dot}`} />
      </span>

      <span className={`text-xs font-medium ${state.text}`}>{state.label}</span>

      {status === 'ok' && model && (
        <span className="hidden text-xs text-ink-500 sm:inline">· {model}</span>
      )}

      <button
        type="button"
        onClick={onRetry}
        disabled={status === 'checking'}
        className="focus-accent rounded-full px-2 py-0.5 text-xs text-ink-400 transition-colors hover:bg-ink-800 hover:text-ink-200 disabled:opacity-40"
      >
        {status === 'checking' ? '…' : 'Recheck'}
      </button>
    </div>
  )
}
