import { useState } from 'react'
import type { HistoryEntry, Tendency } from '../lib/api.js'
import { typeMeta } from '../lib/mbti-meta.js'
import { Mascot } from '../components/Mascot.js'

function fmt(at: number): string {
  try {
    return new Date(at).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))

function strengthWord(v: number): string {
  const a = Math.abs(v)
  return a >= 0.6 ? '明显' : a >= 0.25 ? '略偏' : '中间'
}

/** 中心分割条:从中心向主导侧延伸;显示主导侧 + 强度 + 软化后的百分比 */
function Bar({ t }: { t: Tendency }) {
  const v = (clamp(t.posPct, 0, 100) - 50) / 50
  const dom: 'pos' | 'neg' = v >= 0 ? 'pos' : 'neg'
  const domLabel = dom === 'pos' ? t.posLabel : t.negLabel
  const magPct = Math.round(50 + Math.abs(v) * 50)
  const pctText = magPct >= 90 ? '≥90%' : magPct <= 10 ? '≤10%' : magPct + '%'
  const segW = Math.abs(v) * 50
  return (
    <div className="rbar-item">
      <div className="rbar-row">
        <span className={`rlabel ${dom === 'pos' ? 'dom' : ''}`}>{t.posLabel}</span>
        <div className="rbar">
          <div className="rmid" />
          <div className={`rseg ${dom}`} style={{ width: segW + '%' }} />
        </div>
        <span className={`rlabel right ${dom === 'neg' ? 'dom' : ''}`}>{t.negLabel}</span>
      </div>
      <div className="rbar-cap">
        {domLabel} · {strengthWord(v)} {pctText}
      </div>
    </div>
  )
}

async function loadMascotImage(code: string): Promise<HTMLImageElement | null> {
  for (const ext of ['png', 'webp', 'svg']) {
    const ok = await new Promise<HTMLImageElement | null>((res) => {
      const img = new Image()
      img.onload = () => res(img)
      img.onerror = () => res(null)
      img.src = `/mascots/${code}.${ext}`
    })
    if (ok) return ok
  }
  return null
}

/** 把一条结果画成一张好看的 PNG 报告 */
async function makeReportImage(e: HistoryEntry): Promise<Blob | null> {
  const W = 900
  const H = 1160
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const meta = typeMeta(e.code)
  const accent = meta?.color || '#7aa2ff'
  const font = (size: number, weight = 400) =>
    `${weight} ${size}px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`

  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#141a38')
  g.addColorStop(1, '#0b1020')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const rg = ctx.createRadialGradient(W * 0.28, 0, 0, W * 0.28, 0, W * 0.95)
  rg.addColorStop(0, hexA(accent, 0.28))
  rg.addColorStop(1, hexA(accent, 0))
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, W, H)

  const PAD = 72
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#8f96c8'
  ctx.font = font(26, 600)
  ctx.fillText('心语 · 对话式 MBTI 测评', PAD, 96)

  // 小人(优先图片,否则 emoji)
  const img = meta ? await loadMascotImage(e.code) : null
  const mascotY = 130
  if (img) {
    const s = 190
    ctx.drawImage(img, W - PAD - s, mascotY, s, s)
  } else if (meta) {
    ctx.font = font(170)
    ctx.textAlign = 'right'
    ctx.fillText(meta.emoji, W - PAD, mascotY + 160)
    ctx.textAlign = 'left'
  }

  ctx.fillStyle = '#c9cff0'
  ctx.font = font(30, 500)
  ctx.fillText('我的性格类型', PAD, 196)
  ctx.fillStyle = '#ffffff'
  ctx.font = font(180, 800)
  ctx.fillText(e.code || '—', PAD - 6, 366)
  if (meta) {
    ctx.fillStyle = accent
    ctx.font = font(36, 600)
    ctx.fillText(`${meta.name} · ${meta.alias}`, PAD, 420)
  }

  // 维度条(中心分割)
  let y = 520
  const barX = PAD + 130
  const barW = W - PAD * 2 - 130 - 96
  const midX = barX + barW / 2
  for (const t of e.tendencies || []) {
    const v = (clamp(t.posPct, 0, 100) - 50) / 50
    const dom: 'pos' | 'neg' = v >= 0 ? 'pos' : 'neg'
    const domLabel = dom === 'pos' ? t.posLabel : t.negLabel
    const magPct = Math.round(50 + Math.abs(v) * 50)
    const pctText = magPct >= 90 ? '≥90%' : magPct <= 10 ? '≤10%' : magPct + '%'
    ctx.fillStyle = '#c9cff0'
    ctx.font = font(28, 600)
    ctx.textAlign = 'right'
    ctx.fillText(t.posLabel, barX - 24, y + 10)
    ctx.textAlign = 'left'
    ctx.fillText(t.negLabel, barX + barW + 24, y + 10)
    // 轨道
    ctx.fillStyle = '#232a4f'
    roundRect(ctx, barX, y - 8, barW, 22, 11)
    ctx.fill()
    // 中心分割填充
    const segW = (barW * Math.abs(v)) / 2
    ctx.fillStyle = dom === 'pos' ? '#7aa2ff' : '#f472b6'
    if (dom === 'pos') roundRect(ctx, midX, y - 8, segW, 22, 11)
    else roundRect(ctx, midX - segW, y - 8, segW, 22, 11)
    ctx.fill()
    // 中心线
    ctx.fillStyle = '#3a4270'
    ctx.fillRect(midX - 1, y - 12, 2, 30)
    // 说明
    ctx.fillStyle = '#8f96c8'
    ctx.font = font(24, 600)
    ctx.textAlign = 'left'
    ctx.fillText(`${domLabel} · ${strengthWord(v)} ${pctText}`, barX + barW + 24 + 150, y + 10)
    y += 82
  }

  // 解读
  ctx.textAlign = 'left'
  ctx.fillStyle = '#e6e9f5'
  ctx.font = font(30, 400)
  y += 20
  const maxW = W - PAD * 2
  for (const line of wrap(ctx, e.summary || '', maxW)) {
    ctx.fillText(line, PAD, y)
    y += 46
    if (y > H - 130) break
  }

  ctx.fillStyle = '#6b72a0'
  ctx.font = font(24, 500)
  ctx.fillText('https://mbti.zxlumen.cn', PAD, H - 64)
  ctx.textAlign = 'right'
  ctx.fillText(fmt(e.at), W - PAD, H - 64)

  return await new Promise((res) => c.toBlob((b) => res(b), 'image/png'))
}

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${a})`
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, Math.abs(w) / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const ch of para) {
      if (ctx.measureText(line + ch).width > maxW && line) {
        out.push(line)
        line = ch
      } else {
        line += ch
      }
    }
    out.push(line)
  }
  return out
}

async function shareImage(e: HistoryEntry) {
  const blob = await makeReportImage(e)
  if (!blob) return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `心语-MBTI-${e.code || 'result'}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 3000)
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
  } catch {
    /* 忽略 */
  }
}

export function Report({
  history,
  onClear,
  onGoTest,
}: {
  history: HistoryEntry[]
  onClear: () => void
  onGoTest: () => void
}) {
  const [busy, setBusy] = useState<number | null>(null)

  if (!history.length) {
    return (
      <div className="report card">
        <h1>我的报告</h1>
        <p className="report-empty">还没有完成的测评。去「测评」聊一轮，结果会出现在这里。</p>
        <button className="btn" onClick={onGoTest}>
          去测评
        </button>
      </div>
    )
  }

  return (
    <div className="report">
      <div className="report-head">
        <h1>我的报告</h1>
        <button className="link-btn" onClick={onClear}>
          清空
        </button>
      </div>
      {history.map((e, i) => {
        const meta = typeMeta(e.code)
        return (
          <details key={e.at} className="report-item" open={i === 0}>
            <summary>
              <span className="report-sum-left">
                <Mascot code={e.code} size={44} />
                <b className="report-code">{e.code || '—'}</b>
                {meta && (
                  <span className="report-name">
                    {meta.name} · {meta.alias}
                  </span>
                )}
              </span>
              <span className="report-date">{fmt(e.at)}</span>
            </summary>
            <div className="report-body">
              {e.tendencies?.length > 0 && (
                <div className="rbars">
                  {e.tendencies.map((t) => (
                    <Bar key={t.dim} t={t} />
                  ))}
                </div>
              )}
              {e.summary && <p className="report-summary">{e.summary}</p>}
              <div className="report-actions">
                <button
                  className="btn"
                  disabled={busy === i}
                  onClick={async () => {
                    setBusy(i)
                    try {
                      await shareImage(e)
                    } finally {
                      setBusy(null)
                    }
                  }}
                >
                  {busy === i ? '生成中…' : '保存报告图片'}
                </button>
                <button className="btn ghost" onClick={() => navigator.clipboard.writeText(`我的性格类型：${e.code}`)}>
                  复制类型
                </button>
              </div>
            </div>
          </details>
        )
      })}
      <p className="disclaimer">
        本测评基于 MBTI 理论，用于自我探索，不作为心理诊断、医疗、就业或其他关键决策的唯一依据。
      </p>
    </div>
  )
}
