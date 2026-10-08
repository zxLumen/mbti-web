const HOST_ORIGIN = (() => {
  try {
    return document.referrer ? new URL(document.referrer).origin : ''
  } catch {
    return ''
  }
})()

export const EMBEDDED = typeof window !== 'undefined' && window.parent !== window && !!HOST_ORIGIN

export function postToHost(data: Record<string, unknown>): void {
  if (!EMBEDDED) return
  try {
    window.parent.postMessage(data, HOST_ORIGIN)
  } catch {}
}
