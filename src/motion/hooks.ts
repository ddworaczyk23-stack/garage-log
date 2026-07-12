import { useEffect, useRef, useState } from 'preact/hooks'

// Motion foundation for the editorial-motion design system. Pure Preact hooks,
// no DOM-library dependency. Every animated surface routes through these so the
// whole app shares one physics — and one honest reduced-motion / no-JS story.

/** True when the user asked the OS to reduce motion. Live (updates on change). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/**
 * Reveal-on-scroll. Returns a ref to attach and an `inView` flag that flips true
 * once (and stays true) when the element enters the viewport. Falls back to
 * immediately-visible when IntersectionObserver is unavailable, so content is
 * never trapped hidden.
 */
export function useReveal<T extends HTMLElement>(opts: { threshold?: number; rootMargin?: string } = {}) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true)
            io.disconnect()
          }
        }
      },
      { threshold: opts.threshold ?? 0.15, rootMargin: opts.rootMargin ?? '0px 0px -6% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return { ref, inView }
}

/**
 * Animates a number from `from` to `target` with an ease-out curve when `active`
 * and motion is allowed; otherwise returns `target` immediately. Used for the
 * odometer, the focal gauge readout, and headline totals.
 */
export function useCountUp(
  target: number,
  opts: { from?: number; durationMs?: number; active?: boolean; reduced?: boolean } = {},
): number {
  const { from = 0, durationMs = 900, active = true, reduced = false } = opts
  const skip = reduced || !active
  const [value, setValue] = useState(skip ? target : from)
  const rafRef = useRef(0)
  useEffect(() => {
    if (skip) {
      setValue(target)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(from + (target - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line — from/durationMs are read once at start on purpose
  }, [target, skip])
  return value
}

/**
 * Once-per-session gate for the load intro. Returns true on the first mount of a
 * session and false thereafter (sessionStorage), so a frequently-opened utility
 * delights on first open but stays snappy after. Reduced-motion callers should
 * ignore the result and jump straight to final state.
 */
export function useIntroGate(key = 'gl_intro'): boolean {
  const [play] = useState(() => {
    if (typeof sessionStorage === 'undefined') return false
    try {
      if (sessionStorage.getItem(key) === '1') return false
      sessionStorage.setItem(key, '1')
      return true
    } catch {
      return false
    }
  })
  return play
}
