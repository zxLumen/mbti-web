const AX = ['E','I','S','N','T','F','J','P'] as const

export function AxisBars({ conf, scores }: { conf: Record<string, number>; scores: Record<string, number> }) {
  return (
    <div className="axes">
      {AX.map(a => {
        const c = Math.min(1, conf[a] || 0)
        const w = Math.max(10, Math.round(c * 100))
        return (
          <div className="axis" key={a}>
            <div>{a}</div>
            <div className="axis-track">
              <div className="axis-fill" style={{ width: `${w}%` }} />
            </div>
            <div>{w}%</div>
          </div>
        )
      })}
    </div>
  )
}
