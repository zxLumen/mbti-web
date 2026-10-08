import { useState } from 'react'
import { typeMeta } from '../lib/mbti-meta.js'

const EXTS = ['svg', 'png', 'webp']

/**
 * 类型小人:优先用 `mascots/<CODE>.(svg|png|webp)`(默认 16Personalities 插画),
 * 找不到则回退 emoji 拟人。
 *
 * - `square`(默认):方形小图
 * - `avatar`:列表行小头像(cover 裁切,偏左取主角色)
 * - `banner`:横幅场景图(900x350,整宽展示不变形)
 */
export function Mascot({
  code,
  size = 96,
  variant = 'square',
  className = '',
}: {
  code: string
  size?: number
  variant?: 'square' | 'avatar' | 'banner'
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
    if (variant === 'avatar') {
      return (
        <span
          className={`mascot-emoji mascot-avatar ${className}`}
          style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
        >
          {meta.emoji}
        </span>
      )
    }
    return (
      <span className={`mascot-emoji ${className}`} style={{ fontSize: Math.round(size * 0.82), lineHeight: 1 }}>
        {meta.emoji}
      </span>
    )
  }

  const src = `/mascots/${code}.${EXTS[extIdx]}`

  if (variant === 'banner') {
    return (
      <div className={`mascot-banner ${className}`}>
        <img src={src} alt={meta.name} loading="lazy" onError={onErr} />
      </div>
    )
  }

  if (variant === 'avatar') {
    return (
      <img
        className={`mascot-avatar ${className}`}
        src={src}
        alt={meta.name}
        width={size}
        height={size}
        loading="lazy"
        onError={onErr}
      />
    )
  }

  return (
    <img
      className={`mascot-img ${className}`}
      src={src}
      alt={meta.name}
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain' }}
      onError={onErr}
    />
  )
}
