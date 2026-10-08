import type { Tendency } from '../lib/api.js'

export function Result({
  code,
  summary,
  tendencies,
  onRestart,
}: {
  code: string
  summary: string
  tendencies: Tendency[]
  onRestart: () => void
}) {
  return (
    <div className="card" style={{ gap: 18 }}>
      <h1 style={{ textAlign: 'center' }}>你的性格类型</h1>
      <div className="result-code">{code}</div>
      {summary && <p className="result-summary">{summary}</p>}
      {tendencies.length > 0 && (
        <div className="result-axes">
          {tendencies.map((t) => (
            <div key={t.dim} className="result-row">
              <div className="label">{t.posLabel}</div>
              <div className="bar">
                <div className="fill" style={{ width: t.posPct + '%' }} />
              </div>
              <div className="label" style={{ textAlign: 'right' }}>
                {t.negLabel}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="disclaimer">
        本测评基于 MBTI 理论，用于自我探索，不作为心理诊断、医疗、就业或其他关键决策的唯一依据。
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button className="btn ghost" onClick={onRestart}>
          重新聊聊
        </button>
        <button
          className="btn"
          onClick={() => {
            navigator.clipboard.writeText('我的性格类型：' + code + ' · https://mbti.zxlumen.cn')
          }}
        >
          复制分享
        </button>
      </div>
    </div>
  )
}
