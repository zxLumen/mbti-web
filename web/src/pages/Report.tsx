import { useState } from 'react'
import type { HistoryEntry, Tendency } from '../lib/api.js'

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

function Bar({ t }: { t: Tendency }) {
  const pos = Math.max(0, Math.min(100, t.posPct))
  const neg = 100 - pos
  return (
    <div className="rbar-row">
      <span className="rlabel">{t.posLabel}</span>
      <div className="rbar" title={`${t.posLabel} ${pos}% / ${t.negLabel} ${neg}%`}>
        <div className="rfill pos" style={{ width: pos + '%' }} />
        <div className="rfill neg" style={{ width: neg + '%' }} />
      </div>
      <span className="rlabel right">{t.negLabel}</span>
      <span className="rpct">{pos}%</span>
    </div>
  )
}

/** 把一条结果画成一张好看的 PNG 报告 */
async function makeReportImage(e: HistoryEntry): Promise<Blob | null> {
  const W = 900
  const H = 1150
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const font = (size: number, weight = 400) =>
    `${weight} ${size}px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`

  // 背景
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#141a38')
  g.addColorStop(1, '#0b1020')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  // 顶部光晕
  const rg = ctx.createRadialGradient(W * 0.3, 0, 0, W * 0.3, 0, W * 0.9)
  rg.addColorStop(0, 'rgba(122,162,255,0.28)')
  rg.addColorStop(1, 'rgba(122,162,255,0)')
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, W, H)

  const PAD = 72
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = '#8f96c8'
  ctx.font = font(26, 600)
  ctx.fillText('心语 · 对话式 MBTI 测评', PAD, 96)

  ctx.fillStyle = '#c9cff0'
  ctx.font = font(30, 500)
  ctx.fillText('我的性格类型', PAD, 190)

  // 大号类型
  ctx.fillStyle = '#ffffff'
  ctx.font = font(190, 800)
  ctx.fillText(e.code || '—', PAD - 6, 360)

  // 维度条
  let y = 470
  const barX = PAD + 130
  const barW = W - PAD * 2 - 130 - 96
  for (const t of e.tendencies || []) {
    const pos = Math.max(0, Math.min(100, t.posPct))
    ctx.fillStyle = '#c9cff0'
    ctx.font = font(28, 600)
    ctx.textAlign = 'right'
    ctx.fillText(t.posLabel, barX - 24, y + 12)
    ctx.textAlign = 'left'
    ctx.fillText(t.negLabel, barX + barW + 24, y + 12)
    // 轨道
    ctx.fillStyle = '#232a4f'
    roundRect(ctx, barX, y - 6, barW, 26, 13)
    ctx.fill()
    // 两段填充
    const pw = (barW * pos) / 100
    ctx.fillStyle = '#7aa2ff'
    roundRect(ctx, barX, y - 6, Math.max(pw, 0), 26, 13)
    ctx.fill()
    ctx.fillStyle = '#f472b6'
    roundRect(ctx, barX + pw, y - 6, Math.max(barW - pw, 0), 26, 13)
    ctx.fill()
    // 百分比
    ctx.fillStyle = '#8f96c8'
    ctx.font = font(24, 600)
    ctx.fillText(pos + '%', barX + barW + 24 + 150, y + 12)
    y += 78
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

  // 页脚
  ctx.fillStyle = '#6b72a0'
  ctx.font = font(24, 500)
  ctx.fillText('https://mbti.zxlumen.cn', PAD, H - 64)
  ctx.textAlign = 'right'
  ctx.fillText(fmt(e.at), W - PAD, H - 64)

  return await new Promise((res) => c.toBlob((b) => res(b), 'image/png'))
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
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
    // 顺手尝试复制到剪贴板(部分浏览器支持)
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
      {history.map((e, i) => (
        <details key={e.at} className="report-item" open={i === 0}>
          <summary>
            <b className="report-code">{e.code || '—'}</b>
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
      ))}
      <p className="disclaimer">
        本测评基于 MBTI 理论，用于自我探索，不作为心理诊断、医疗、就业或其他关键决策的唯一依据。
      </p>
    </div>
  )
}
