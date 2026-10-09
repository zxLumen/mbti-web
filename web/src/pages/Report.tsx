import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import type { HistoryEntry, MbtiHistoryPoint, StructuredReport, Tendency } from '../lib/api.js'
import { typeMeta, TYPE_META } from '../lib/mbti-meta.js'
import { Mascot } from '../components/Mascot.js'
import { readUnlocked } from '../lib/report-store.js'
import TYPE_REPORTS_JSON from '../data/type-reports.json'
import { readAtype, applyTypeTheme, applyDefaultTheme } from '../lib/theme.js'
import { ALGO_VERSION, tendenciesFromHistory } from '../lib/mbti-engine.js'

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

const TYPE_VARS = [
  '--img-bg1', '--img-bg2', '--img-fg', '--img-dim', '--img-label',
  '--accent', '--bar-pos', '--bar-neg', '--bar-track', '--bar-mid',
]

/** 用隐藏探针读某类型极光的 CSS 变量(避免把 16 套颜色在 JS 里再写一遍) */
function typeVars(code: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (typeof document === 'undefined' || !/^[A-Z]{4}$/.test(code)) return out
  const probe = document.createElement('div')
  probe.setAttribute('data-theme', 'aurora')
  probe.setAttribute('data-atype', code)
  probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px'
  document.body.appendChild(probe)
  const cs = getComputedStyle(probe)
  for (const n of TYPE_VARS) out[n] = cs.getPropertyValue(n).trim()
  probe.remove()
  return out
}

/** 四维「清晰度」雷达图:半径=该维明确程度,标签=主导侧 */
function Radar({ tendencies }: { tendencies: Tendency[] }) {
  const R = 76
  const CX = 100
  const CY = 100
  const dims: Array<[string, number]> = [
    ['EI', -90],
    ['SN', 0],
    ['TF', 90],
    ['JP', 180],
  ]
  const at = (ang: number, r: number) => {
    const a = (ang * Math.PI) / 180
    return [CX + Math.cos(a) * r, CY + Math.sin(a) * r] as const
  }
  const rows = dims.map(([d, ang]) => ({ ang, t: tendencies.find((x) => x.dim === d) }))
  const pts = rows
    .map(({ ang, t }) => {
      const clarity = t ? Math.min(1, Math.abs((t.posPct - 50) / 50)) : 0
      const [x, y] = at(ang, 14 + clarity * (R - 14))
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg className="radar" viewBox="-42 -16 284 232" role="img" aria-label="四维清晰度">
      {[0.34, 0.67, 1].map((f) => (
        <circle key={f} cx={CX} cy={CY} r={R * f} className="radar-ring" />
      ))}
      {rows.map(({ ang }, i) => {
        const [x, y] = at(ang, R)
        return <line key={i} x1={CX} y1={CY} x2={x} y2={y} className="radar-axis" />
      })}
      <polygon points={pts} className="radar-area" />
      {rows.map(({ ang, t }, i) => {
        const [lx, ly] = at(ang, R + 18)
        const dom = t ? (t.posPct >= 50 ? t.posLabel : t.negLabel) : ''
        const p = t ? Math.round(t.posPct >= 50 ? t.posPct : 100 - t.posPct) : 0
        return (
          <text key={i} x={lx} y={ly} className="radar-label" textAnchor="middle" dominantBaseline="middle">
            {dom}
            {p ? ` ${p}%` : ''}
          </text>
        )
      })}
    </svg>
  )
}

/** 16 型的通用分析(预生成,固化;不含作答证据) */
const TYPE_REPORTS = TYPE_REPORTS_JSON as unknown as Record<string, StructuredReport>

/** 报告正文模块(已解锁=按问答 / 未解锁=通用,共用) */
function ReportModules({ report, tendencies }: { report?: StructuredReport; tendencies: Tendency[] }) {
  if (!report) return null
  return (
    <>
      {report.tagline && <p className="rep-tagline">{report.tagline}</p>}
      {report.overview && <p className="report-summary">{report.overview}</p>}
      {report.keywords?.length > 0 && (
        <div className="rep-keywords">
          {report.keywords.map((k, ki) => (
            <span key={ki} className="rep-kw">
              {k}
            </span>
          ))}
        </div>
      )}

      {tendencies?.length > 0 && (
        <div className="rep-visual">
          <Radar tendencies={tendencies} />
          <div className="rbars">
            {tendencies.map((t) => (
              <Bar key={t.dim} t={t} />
            ))}
          </div>
        </div>
      )}

      {report.cognition?.length > 0 && (
        <div className="rep-block">
          <div className="rep-h">认知功能栈</div>
          {report.cognition.map((c) => (
            <div key={c.fn} className="cog-row">
              <span className="cog-fn">
                {c.fn}
                <i>{c.name}</i>
              </span>
              <div className="cog-track">
                <div className="cog-fill" style={{ width: (c.level / 4) * 100 + '%' }} />
              </div>
              <span className="cog-note">{c.note}</span>
            </div>
          ))}
        </div>
      )}

      {(report.strengths?.length > 0 || report.blindspots?.length > 0) && (
        <div className="rep-cols">
          <div className="rep-col">
            <div className="rep-h">优势倾向</div>
            {report.strengths.map((x, i) => (
              <div key={i} className="pt">
                <b>{x.t}</b>
                <span>{x.d}</span>
              </div>
            ))}
          </div>
          <div className="rep-col">
            <div className="rep-h">可能的盲点</div>
            {report.blindspots.map((x, i) => (
              <div key={i} className="pt">
                <b>{x.t}</b>
                <span>{x.d}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(report.work || report.social || report.stress) && (
        <div className="rep-cards">
          {report.work && (
            <div className="rep-card">
              <div className="rep-h">工作 / 学习</div>
              <p>{report.work}</p>
            </div>
          )}
          {report.social && (
            <div className="rep-card">
              <div className="rep-h">人际 / 沟通</div>
              <p>{report.social}</p>
            </div>
          )}
          {report.stress && (
            <div className="rep-card">
              <div className="rep-h">压力下的表现</div>
              <p>{report.stress}</p>
            </div>
          )}
        </div>
      )}

      {report.growth?.length > 0 && (
        <div className="rep-block">
          <div className="rep-h">行动建议</div>
          <ol className="rep-growth">
            {report.growth.map((g, gi) => (
              <li key={gi}>{g}</li>
            ))}
          </ol>
        </div>
      )}
    </>
  )
}

async function loadMascotImage(code: string): Promise<HTMLImageElement | null> {
  for (const ext of ['svg', 'png', 'webp']) {
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

/** 画布版雷达图(4 维清晰度);返回新的 y */
function drawRadarCanvas(
  ctx: CanvasRenderingContext2D,
  tend: Tendency[],
  topY: number,
  r: number,
  C: { accent: string; dim: string; track: string },
  font: (n: number, w?: number) => string,
): number {
  const W = 900
  const cx = W / 2
  const cy = topY + r
  const dims: Array<[string, number]> = [
    ['EI', -90],
    ['SN', 0],
    ['TF', 90],
    ['JP', 180],
  ]
  const at = (ang: number, rad: number) => {
    const a = (ang * Math.PI) / 180
    return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad] as const
  }
  ctx.strokeStyle = C.track
  ctx.lineWidth = 1.5
  for (const f of [0.34, 0.67, 1]) {
    ctx.beginPath()
    ctx.arc(cx, cy, r * f, 0, Math.PI * 2)
    ctx.stroke()
  }
  for (const [, ang] of dims) {
    const [x, y] = at(ang, r)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  const pts = dims.map(([d, ang]) => {
    const t = tend.find((x) => x.dim === d)
    const cl = t ? Math.min(1, Math.abs((t.posPct - 50) / 50)) : 0
    return at(ang, r * 0.16 + cl * r * 0.84)
  })
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.closePath()
  ctx.fillStyle = hexA(C.accent, 0.26)
  ctx.fill()
  ctx.strokeStyle = C.accent
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.fillStyle = C.accent
  for (const [x, y] of pts) {
    ctx.beginPath()
    ctx.arc(x, y, 5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.font = font(26, 600)
  ctx.fillStyle = C.dim
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  for (const [d, ang] of dims) {
    const t = tend.find((x) => x.dim === d)
    const dom = t ? (t.posPct >= 50 ? t.posLabel : t.negLabel) : ''
    const p = t ? Math.round(t.posPct >= 50 ? t.posPct : 100 - t.posPct) : 0
    const [x, y] = at(ang, r + 36)
    ctx.fillText(dom ? `${dom} ${p}%` : '', x, y)
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  return cy + r + 84
}

export type ReportLayout = 'bars' | 'both' | 'radar'

/** 把一条结果画成一张好看的 PNG 报告(layout: 只条形 / 条形+雷达 / 只雷达) */
async function makeReportImage(e: HistoryEntry, layout: ReportLayout = 'bars'): Promise<Blob | null> {
  const W = 900
  const H = layout === 'both' ? 2260 : layout === 'radar' ? 1960 : 1800
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const meta = typeMeta(e.code)
  const accent = meta?.color || '#7aa2ff'
  const font = (size: number, weight = 400) =>
    `${weight} ${size}px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif`

  // 跟随「该报告的类型」配色:用隐藏探针读 CSS 变量(颜色只维护在 CSS 一处)
  const tv = typeVars(e.code)
  const v = (n: string, fb: string) => tv[n] || fb
  const bg1 = v('--img-bg1', '#141a38')
  const bg2 = v('--img-bg2', '#0b1020')
  const fg = v('--img-fg', '#e6e9f5')
  const dim = v('--img-dim', '#8f96c8')
  const lbl = v('--img-label', '#c9cff0')
  const barPos = v('--bar-pos', '#7aa2ff')
  const barNeg = v('--bar-neg', '#f472b6')
  const barTrack = v('--bar-track', '#232a4f')
  const barMid = v('--bar-mid', '#3a4270')

  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, bg1)
  g.addColorStop(1, bg2)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const rg = ctx.createRadialGradient(W * 0.28, 0, 0, W * 0.28, 0, W * 0.95)
  rg.addColorStop(0, hexA(accent, 0.26))
  rg.addColorStop(1, hexA(accent, 0))
  ctx.fillStyle = rg
  ctx.fillRect(0, 0, W, H)

  const PAD = 72
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = dim
  ctx.font = font(26, 600)
  ctx.fillText('心语 · 对话式 MBTI 测评', PAD, 96)

  // 顶部横幅插画(16P 场景图 900x350,按 cover 裁切)
  const img = meta ? await loadMascotImage(e.code) : null
  const bannerY = 124
  const bannerW = W - PAD * 2
  const bannerH = 210
  if (img) {
    drawCover(ctx, img, PAD, bannerY, bannerW, bannerH)
  } else if (meta) {
    ctx.fillStyle = hexA(accent, 0.18)
    roundRect(ctx, PAD, bannerY, bannerW, bannerH, 24)
    ctx.fill()
    ctx.font = font(120)
    ctx.textAlign = 'center'
    ctx.fillText(meta.emoji, W / 2, bannerY + 158)
    ctx.textAlign = 'left'
  }

  const TYPE_Y = 410
  const CODE_Y = 612
  const NAME_Y = 676
  ctx.fillStyle = lbl
  ctx.font = font(30, 500)
  ctx.fillText('我的性格类型', PAD, TYPE_Y)
  ctx.fillStyle = fg
  ctx.font = font(190, 800)
  ctx.fillText(e.code || '—', PAD - 6, CODE_Y)
  if (meta) {
    ctx.fillStyle = accent
    ctx.font = font(36, 600)
    ctx.fillText(`${meta.name} · ${meta.alias}`, PAD, NAME_Y)
  }
  const kws = (e.report?.keywords || []).slice(0, 6)
  if (kws.length) {
    ctx.fillStyle = dim
    ctx.font = font(26, 600)
    ctx.fillText(kws.join(' · '), PAD, NAME_Y + 46)
  }

  // 视觉区:按 layout 画「雷达 / 条形」
  const barX = PAD + 116
  const barW = W - PAD * 2 - 116 * 2
  const midX = barX + barW / 2
  let y = 812
  if (layout !== 'bars') {
    const r = layout === 'radar' ? 230 : 172
    y = drawRadarCanvas(ctx, e.tendencies || [], y, r, { accent, dim, track: barTrack }, font)
  }
  for (const t of layout === 'radar' ? [] : e.tendencies || []) {
    const v = (clamp(t.posPct, 0, 100) - 50) / 50
    const dom: 'pos' | 'neg' = v >= 0 ? 'pos' : 'neg'
    const domLabel = dom === 'pos' ? t.posLabel : t.negLabel
    const magPct = Math.round(50 + Math.abs(v) * 50)
    const pctText = magPct >= 90 ? '≥90%' : magPct <= 10 ? '≤10%' : magPct + '%'
    ctx.fillStyle = lbl
    ctx.font = font(28, 600)
    ctx.textAlign = 'right'
    ctx.fillText(t.posLabel, barX - 20, y + 8)
    ctx.textAlign = 'left'
    ctx.fillText(t.negLabel, barX + barW + 20, y + 8)
    // 轨道
    ctx.fillStyle = barTrack
    roundRect(ctx, barX, y - 10, barW, 22, 11)
    ctx.fill()
    // 中心分割填充
    const segW = (barW * Math.abs(v)) / 2
    ctx.fillStyle = dom === 'pos' ? barPos : barNeg
    if (dom === 'pos') roundRect(ctx, midX - segW, y - 10, segW, 22, 11)
    else roundRect(ctx, midX, y - 10, segW, 22, 11)
    ctx.fill()
    // 中心线
    ctx.fillStyle = barMid
    ctx.fillRect(midX - 1, y - 14, 2, 30)
    // 说明(条下方)
    ctx.fillStyle = dim
    ctx.font = font(24, 600)
    ctx.textAlign = 'left'
    ctx.fillText(`${domLabel} · ${strengthWord(v)} ${pctText}`, barX, y + 42)
    y += 96
  }

  // 优势 3 条
  const st = (e.report?.strengths || []).slice(0, 3)
  if (st.length) {
    ctx.textAlign = 'left'
    ctx.fillStyle = fg
    ctx.font = font(28, 700)
    ctx.fillText('优势倾向', PAD, y + 20)
    y += 62
    for (const s2 of st) {
      ctx.fillStyle = accent
      ctx.font = font(27, 700)
      ctx.fillText('· ' + s2.t, PAD, y)
      ctx.fillStyle = fg
      ctx.font = font(25, 400)
      const tw = ctx.measureText('· ' + s2.t + '  ').width
      ctx.fillText(s2.d, PAD + tw, y)
      y += 44
    }
  }

  // 解读(概览)
  ctx.textAlign = 'left'
  ctx.fillStyle = fg
  ctx.font = font(30, 400)
  y += 46
  const maxW = W - PAD * 2
  for (const line of wrap(ctx, e.summary || '', maxW)) {
    ctx.fillText(line, PAD, y)
    y += 46
    if (y > H - 150) break
  }

  ctx.fillStyle = dim
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

/** 等比 cover 裁切绘制(横幅插画 → 任意矩形),带圆角裁切 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const iw = img.naturalWidth || 900
  const ih = img.naturalHeight || 350
  const sa = iw / ih
  const da = w / h
  let sw = iw
  let sh = ih
  let sx = 0
  let sy = 0
  if (da > sa) {
    sw = ih * da
    sx = (iw - sw) / 2
  } else {
    sh = iw / da
    sy = (ih - sh) / 2
  }
  ctx.save()
  ctx.beginPath()
  roundRect(ctx, x, y, w, h, 24)
  ctx.clip()
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
  ctx.restore()
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
  const blob = await makeReportImage(e, 'both')
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
  onUpdate,
}: {
  history: HistoryEntry[]
  onClear: () => void
  onGoTest: () => void
  onUpdate: (at: number, patch: Partial<HistoryEntry>) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [active, setActive] = useState<string>(() => readAtype())
  const unlocked = readUnlocked()
  const allCodes = Object.keys(TYPE_META)

  // 按类型归组(history 最新在前)
  const byType = new Map<string, HistoryEntry[]>()
  for (const e of history) {
    if (!/^[A-Z]{4}$/.test(e.code)) continue
    const list = byType.get(e.code) || []
    list.push(e)
    byType.set(e.code, list)
  }

  // 顺序:已解锁(按解锁顺序) → 其余(固定顺序)
  const unlockedCodes = [
    ...unlocked.filter((c) => TYPE_META[c]),
    ...[...byType.keys()].filter((c) => !unlocked.includes(c)),
  ]
  const lockedCodes = allCodes.filter((c) => !unlockedCodes.includes(c))
  const orderedCodes = [...unlockedCodes, ...lockedCodes]

  // 手风琴:同时只展开一个;默认展开第一个已解锁卡
  const [openCode, setOpenCode] = useState<string>(() => unlockedCodes[0] || '')
  const listRef = useRef<HTMLDivElement>(null)

  const scrollToCard = (code: string) => {
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-code="${code}"]`)
      el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
  }

  const toggle = (code: string) => setOpenCode((cur) => (cur === code ? '' : code))

  // 算法变更后:本地按逐题记录重算;站长再从服务器记录刷新(按 sessionId,缺失则按 code 兜底匹配)
  const refreshed = useRef<Set<string>>(new Set())
  useEffect(() => {
    // 本地:有逐题记录但算法版本不符 → 重算
    for (const e of history) {
      if (e.history?.length && e.algoVersion !== ALGO_VERSION) {
        const t = tendenciesFromHistory(e.history as MbtiHistoryPoint[])
        const code = t.map((x) => (x.posPct >= 50 ? x.dim[0] : x.dim[1])).join('')
        onUpdate(e.at, { tendencies: t, code, algoVersion: ALGO_VERSION })
      }
    }
    if (!history.length) return
    ;(async () => {
      try {
        const r = await fetch('/api/mbti/records')
        if (!r.ok) return // 非站长(403)或未启用:静默
        const data = (await r.json()) as {
          algoVersion?: string
          records?: Array<{ id: string; code?: string; tendencies?: Tendency[] }>
        }
        const recs = (data.records || []).filter((x) => x && x.tendencies)
        const usedAt = new Set<number>()
        for (const rec of recs) {
          // 先按 sessionId 精确匹配
          let target = history.find((e) => e.sessionId === rec.id)
          if (!target) {
            // 兜底:本地某条没有 sessionId、且 code 相同 → 视为同一次(就地更新,避免重复)
            target = history.find((e) => !e.sessionId && !usedAt.has(e.at) && e.code === rec.code)
          }
          if (!target) continue
          usedAt.add(target.at)
          if (refreshed.current.has(`${rec.id}:${target.at}`)) continue
          refreshed.current.add(`${rec.id}:${target.at}`)
          const same =
            target.algoVersion === data.algoVersion &&
            JSON.stringify(target.tendencies) === JSON.stringify(rec.tendencies)
          if (same) continue
          onUpdate(target.at, {
            tendencies: rec.tendencies,
            code: rec.code || target.code,
            sessionId: rec.id,
            algoVersion: data.algoVersion,
          })
        }
      } catch {
        /* 忽略 */
      }
    })()
  }, [history, onUpdate])

  return (
    <div className="report">
      <div className="report-head">
        <h1>我的报告</h1>
        {history.length > 0 && (
          <button className="link-btn" onClick={onClear}>
            清空
          </button>
        )}
      </div>

      <div className="collection">
        <div className="collection-head">
          <span>已解锁主题 · {unlockedCodes.length}/16</span>
          <span className="collection-hint">点亮的可全站切换</span>
        </div>
        <div className="tchips">
          <button
            className={`tchip${active ? '' : ' on'}`}
            onClick={() => {
              applyDefaultTheme()
              setActive('')
            }}
          >
            默认 · 纸感
          </button>
          {[...unlockedCodes, ...lockedCodes].map((c) => {
            const m = TYPE_META[c]
            const on = unlockedCodes.includes(c)
            const isOn = active === c
            return (
              <button
                key={c}
                className={`tchip${on ? '' : ' locked'}${isOn ? ' on' : ''}`}
                disabled={!on}
                title={on ? `${m.name} · ${m.alias}` : '未解锁 · 测出该类型后点亮'}
                onClick={() => {
                  if (!on) return
                  applyTypeTheme(c)
                  setActive(c)
                  setOpenCode(c)
                  scrollToCard(c)
                }}
              >
                {on ? c : '🔒'}
              </button>
            )
          })}
        </div>
      </div>

      <div className="report-list" ref={listRef}>
        {unlockedCodes.length === 0 && (
          <p className="report-empty">还没有完成的测评 —— 去「测评」聊一轮，点亮你的第一个类型吧。</p>
        )}

        {orderedCodes.map((code) => {
          const meta = TYPE_META[code]
          const entries = byType.get(code) || []
          const hasData = entries.length > 0
          const e = entries[0]
          const isOpen = openCode === code

          if (!hasData) {
            return (
              <details
                key={code}
                className="report-item locked"
                data-code={code}
                data-theme="aurora"
                data-atype={code}
                open={isOpen}
              >
                <summary onClick={(ev) => { ev.preventDefault(); toggle(code) }}>
                  <span className="report-sum-left">
                    <Mascot code={code} variant="avatar" size={40} />
                    <b className="report-code">{code}</b>
                    <span className="report-name">
                      {meta.name} · {meta.alias}
                    </span>
                  </span>
                  <span className="report-lock">🔒 未解锁</span>
                </summary>
                <div className="report-body">
                  <Mascot code={code} variant="banner" />
                  <p className="report-locked-note">
                    还没测过这个类型。测出 <b>{code}</b>（{meta.name}）后，这里就会点亮。
                  </p>
                  <ReportModules report={TYPE_REPORTS[code]} tendencies={[]} />
                  <div className="report-actions">
                    <button className="btn" onClick={onGoTest}>
                      去测一测
                    </button>
                  </div>
                </div>
              </details>
            )
          }

          return (
            <details
              key={code}
              className="report-item"
              data-code={code}
              data-theme="aurora"
              data-atype={code}
              open={isOpen}
            >
              <summary onClick={(ev) => { ev.preventDefault(); toggle(code) }}>
                <span className="report-sum-left">
                  <Mascot code={code} variant="avatar" size={40} />
                  <b className="report-code">{code}</b>
                  <span className="report-name">
                    {meta.name} · {meta.alias}
                  </span>
                  {entries.length > 1 && <span className="report-count">共 {entries.length} 次</span>}
                </span>
                <span className="report-date">{fmt(e.at)}</span>
              </summary>
              <div className="report-body">
                <Mascot code={code} variant="banner" />

                {e.report ? (
                  <ReportModules report={e.report} tendencies={e.tendencies || []} />
                ) : (
                  <p className="report-summary">{e.summary || '正在生成完整报告…'}</p>
                )}

                <div className="report-actions">
                  <button
                    className="btn"
                    disabled={busy === code}
                    onClick={async () => {
                      setBusy(code)
                      try {
                        await shareImage(e)
                      } finally {
                        setBusy(null)
                      }
                    }}
                  >
                    {busy === code ? '生成中…' : '保存报告图片'}
                  </button>
                  <button
                    className="btn ghost"
                    onClick={() => {
                      applyTypeTheme(code)
                      setActive(code)
                    }}
                  >
                    应用此风格
                  </button>
                  <button className="btn ghost" onClick={() => navigator.clipboard.writeText(`我的性格类型：${code}`)}>
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
    </div>
  )
}
