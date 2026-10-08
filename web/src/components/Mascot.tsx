import { useState } from 'react'
import { typeMeta } from '../lib/mbti-meta.js'

const EXTS = ['png', 'webp', 'svg']

/**
 * 类型小人:优先用 `mascots/<CODE>.(png|webp|svg)`(由用户自行放置),
 * 都没有则回退到 emoji 拟人。
 */
export function Mascot({
  code,
  size = 96,
  className = '',
}: {
  code: string
  size?: number
  className?: string
}) {
  const meta = typeMeta(code)
  const [extIdx, setExtIdx] = useState(0)
  if (!meta) return null
  if (extIdx >= EXTS.length) {
    return (
      <span className={`mascot-emoji ${className}`} style={{ fontSize: Math.round(size * 0.82), lineHeight: 1 }}>
        {meta.emoji}
      </span>
    )
  }
  return (
    <img
      className={`mascot-img ${className}`}
      src={`/mascots/${code}.${EXTS[extIdx]}`}
      alt={meta.name}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      onError={() => setExtIdx((i) => i + 1)}
    />
  )
}
