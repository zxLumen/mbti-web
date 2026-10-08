import type { Axis } from '../lib/mbti-types.js'

export function Result({ code, onRestart }: { code: string; onRestart: () => void }) {
  const axes: Array<[Axis, string, string]> = [
    ['E', '外向', '内向'],
    ['S', '感觉', '直觉'],
    ['T', '思考', '情感'],
    ['J', '判断', '知觉'],
  ]
  return (
    <div className="card" style={{ gap: 20 }}>
      <h1 style={{ textAlign: 'center' }}>你的 MBTI 类型</h1>
      <div className="result-code">{code}</div>
      <div className="result-axes">
        {axes.map(([p, a, b]) => {
          const left = code.includes(p)
          const opp: Axis = p === 'E' ? 'I' : p === 'S' ? 'N' : p === 'T' ? 'F' : 'P'
          const right = code.includes(opp)
          const pct = left ? 70 : right ? 30 : 50
          return (
            <div key={p} className="result-row">
              <div className="label">{a}</div>
              <div className="bar">
                <div className="fill" style={{ width: pct + '%' }} />
              </div>
              <div className="label" style={{ textAlign: 'right' }}>
                {b}
              </div>
            </div>
          )
        })}
      </div>
      <div className="disclaimer">
        本测评基于 MBTI 理论，用于自我探索，不作为心理诊断、医疗、就业或其他关键决策的唯一依据。
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button className="btn ghost" onClick={onRestart}>
          重新测评
        </button>
        <button
          className="btn"
          onClick={() => {
            navigator.clipboard.writeText('MBTI: ' + code + ' · https://mbti.zxlumen.cn')
          }}
        >
          复制分享
        </button>
      </div>
    </div>
  )
}
