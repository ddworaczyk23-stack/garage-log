import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { useCountUp } from '../../motion/hooks'

// The dark "instrument" plate — the odometer readout. The primary value counts
// up on first view (from `countFrom`, e.g. this year's starting mileage, so the
// count literally tells the year's story); an optional year-to-date block on the
// right shows a counting delta + growing month bars.

export interface InstrumentYtd {
  delta: number
  deltaCaption: string
  /** Bar heights as fractions 0..1, most-recent last. */
  bars: number[]
  barsCaption?: string
}

export function Instrument({
  label,
  value,
  unit,
  footer,
  countFrom,
  ytd,
  animate = false,
  reduced = false,
}: {
  label: string
  value: number
  unit?: string
  footer?: ComponentChildren
  countFrom?: number
  ytd?: InstrumentYtd
  animate?: boolean
  reduced?: boolean
}) {
  const main = useCountUp(value, { from: countFrom ?? Math.max(0, value - 2000), active: animate, reduced })
  const delta = useCountUp(ytd?.delta ?? 0, { from: 0, active: animate && !!ytd, reduced })

  // grow the month bars once (after mount) when animating
  const [barsIn, setBarsIn] = useState(reduced || !animate)
  const barTimer = useRef(0)
  useEffect(() => {
    if (reduced || !animate) {
      setBarsIn(true)
      return
    }
    barTimer.current = window.setTimeout(() => setBarsIn(true), 60)
    return () => window.clearTimeout(barTimer.current)
  }, [animate, reduced])

  return (
    <div class="instrument">
      <div class="instr-top">
        <div>
          <span class="kicker">{label}</span>
          <div class="odo">
            <span class="num">{Math.round(main).toLocaleString('en-US')}</span>
            {unit && <span class="unit">{unit}</span>}
          </div>
          {footer && <div class="odo-foot">{footer}</div>}
        </div>
        {ytd && (
          <div class="instr-side">
            <span class="ytd">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M7 17L17 7M8 7h9v9" />
              </svg>
              +{Math.round(delta).toLocaleString('en-US')} mi
            </span>
            <div class="ytd-cap">{ytd.deltaCaption}</div>
            <div class={`mbars${barsIn ? ' is-in' : ''}`}>
              {ytd.bars.map((h, i) => (
                <div
                  key={i}
                  class={`mbar${i < ytd.bars.length - 1 ? ' dim' : ''}`}
                  style={`height:${Math.round(h * 100)}%`}
                />
              ))}
            </div>
            {ytd.barsCaption && <div class="ytd-cap" style="margin-top:5px">{ytd.barsCaption}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
