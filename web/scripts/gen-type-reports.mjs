// 预生成 16 型的「通用分析」(不含作答证据,只按类型)。
//   复用本地服务的 /api/mbti/report(内含提示词与归一化逻辑),避免重复实现。
//   产物固化到 web/src/data/type-reports.json → 所有用户看到的完全一致、零运行时开销。
//
// 用法(本地 mbti 服务需在跑,且已配好可用模型):
//   node web/scripts/gen-type-reports.mjs
//   MBTI_BASE=http://localhost:8787 node web/scripts/gen-type-reports.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'src', 'data', 'type-reports.json')
const BASE = process.env.MBTI_BASE || 'http://localhost:8787'

const CODES = [
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
]

async function genOne(code) {
  const r = await fetch(`${BASE}/api/mbti/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, tendencies: [] }),
  })
  if (!r.ok) throw new Error(`${code} HTTP ${r.status}`)
  const { report } = await r.json()
  if (!report || !report.overview) throw new Error(`${code} 返回为空`)
  return report
}

const out = {}
for (const code of CODES) {
  process.stdout.write(`生成 ${code} ... `)
  try {
    out[code] = await genOne(code)
    console.log('ok')
  } catch (e) {
    console.log('失败:', e.message)
  }
}

await fs.mkdir(path.dirname(OUT), { recursive: true })
await fs.writeFile(OUT, JSON.stringify(out, null, 2) + '\n')
console.log(`\n已写入 ${OUT} (${Object.keys(out).length}/16)`)
