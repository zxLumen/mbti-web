import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export const OWNER_COOKIE = 'mbti_owner'
const BLOG_ADMIN_COOKIE = 'zx_admin'

export function parseCookies(header) {
  const out = {}
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const k = part.slice(0, i).trim()
    if (k) out[k] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

/** 站长兜底 token:环境变量优先,否则在数据目录生成一份 0600 的 */
export function ownerToken(dataDir) {
  if (process.env.MBTI_OWNER_TOKEN) return process.env.MBTI_OWNER_TOKEN
  const file = path.join(dataDir, 'owner.token')
  try {
    const t = fs.readFileSync(file, 'utf8').trim()
    if (t) return t
  } catch {
    /* 首次启动还没有 */
  }
  const t = crypto.randomBytes(16).toString('hex')
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(file, `${t}\n`, { mode: 0o600 })
  } catch {
    /* 只读文件系统时降级 */
  }
  return t
}

/**
 * 博客下发的管理员会话 cookie(`zx_admin` = `<exp>.<hmac_sha256(exp, SESSION_SECRET)>`)。
 * 与主站 apps/next-home/src/lib/auth.ts 同构 —— 同一把 SESSION_SECRET 才能验签通过,
 * 故「已登录博客」即视为站长(生产 `Domain=.zxlumen.cn`,本地 host-only 跨端口共享)。
 */
export function validBlogAdmin(cookies) {
  const secret = process.env.SESSION_SECRET
  if (!secret) return false
  const v = cookies[BLOG_ADMIN_COOKIE]
  if (!v) return false
  const i = v.indexOf('.')
  if (i < 1) return false
  const exp = Number(v.slice(0, i))
  const sig = v.slice(i + 1)
  if (!Number.isFinite(exp) || exp < Date.now() || !sig) return false
  const expected = crypto.createHmac('sha256', secret).update(String(exp)).digest('hex')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function isOwner(req, dataDir) {
  const cookies = parseCookies(req.headers.cookie)
  const token = ownerToken(dataDir)
  return (!!token && cookies[OWNER_COOKIE] === token) || validBlogAdmin(cookies)
}

export function ownerCookieHeader(value, { maxAge = 60 * 60 * 24 * 365 } = {}) {
  return `${OWNER_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`
}
