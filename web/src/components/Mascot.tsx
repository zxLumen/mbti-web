import { useState } from 'react'
import { typeMeta } from '../lib/mbti-meta.js'

const EXTS = ['svg', 'png', 'webp']

/**
 * 类型小人:优先用 `mascots/<CODE>.(svg|png|webp)`(由用户自行放置,默认 16Personalities 插画),
 * 找不到则回退 emoji 拟人。
 *
 * - `square`(默认):方形小图(仅适合方图素材)
 * - `banner`:横幅场景图(16P 插画是 900x350,用这个才不变形)
 */
export function Mascot({
  code,
  size = 96,
  variant = 'square',
  className = '',
}: {
  code: string
  size?: number
  variant?: 'square' | 'banner'
  className?: string
}) {
  const meta = typeMeta(code)
  const [extIdx, setExtIdx] = useState(0)
  if (!meta) return null

  const onErr = () => setExtIdx((i) => i + 1)

  if (extIdx >= EXTS.length) {
    if (variant === 'banner') {
      return (
        <div className={`mascot-banner ${className}`}>
          <span className="mascot-emoji" style={{ fontSize: 72, lineHeight: '210px' }}>
            {meta.emoji}
          </span>
        </div>
      )
    }
    return (
      <span className={`mascot-emoji ${className}`} style={{ fontSize: Math.round(size * 0.82), lineHeight: 1 }}>
        {meta.emoji}
      </span>
    )
  }

  if (variant === 'banner') {
    return (
      <div className={`mascot-banner ${className}`}>
        <img
          src={`/mascots/${code}.${EXTS[extIdx]}`}
          alt={meta.name}
          loading="lazy"
          onError={onErr}
        />
      </div>
    )
  }

  return (
    <img
      className={`mascot-img ${className}`}
      src={`/mascots/${code}.${EXTS[extIdx]}`}
      alt={meta.name}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain' }}
      onError={onErr}
    />
  )
}
