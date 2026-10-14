import { briefToText, type ShopBrief } from '../domain/shopBrief'

export type BriefShareResult =
  | { kind: 'copied'; message: string }
  | { kind: 'error'; message: string }
  | null

/** Share a brief natively when available, otherwise copy its plain-text form. */
export async function shareBrief(brief: ShopBrief): Promise<BriefShareResult> {
  const text = briefToText(brief)
  try {
    if (navigator.share) {
      await navigator.share({ title: `Shop brief — ${brief.vehicleLine}`, text })
      return null
    }
    await navigator.clipboard.writeText(text)
    return { kind: 'copied', message: 'Copied to the clipboard — paste it anywhere.' }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null
    return { kind: 'error', message: "Couldn't share — the brief is still on screen above, or tap Print." }
  }
}
