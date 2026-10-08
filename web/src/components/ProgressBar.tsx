export function ProgressBar({ qCount, minQ, maxQ }: { qCount: number; minQ: number; maxQ: number }) {
  const pct = Math.min(100, Math.round((qCount / maxQ) * 100))
  return (
    <div className="progress">
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div style={{ color: 'var(--dim)', fontSize: 12 }}>已答 {qCount} / 预计 {minQ}–{maxQ}</div>
    </div>
  )
}
