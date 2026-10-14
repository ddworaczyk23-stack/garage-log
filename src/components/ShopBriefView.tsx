import { useState } from 'preact/hooks'
import type { ShopBrief } from '../domain/shopBrief'
import { shareBrief } from './briefShare'
import { checkQuote, diagnosisChecksFromRequest, type DiagnosisCheck, type QuoteRating } from '../domain/quoteCheck'
import { parseNumberInput } from '../domain/format'
import { BAND_LABELS } from '../domain/verdict'

export function ShopBriefView({ brief, headingRef }: { brief: ShopBrief; headingRef?: { current: HTMLHeadingElement | null } }) {
  const [shared, setShared] = useState<string | null>(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const request = brief.request.replace(/^please[,:]?\s*/i, '')
  const capitalizedRequest = request ? request.charAt(0).toUpperCase() + request.slice(1) : request
  async function onShare() {
    setShared(null); setShareError(null)
    const result = await shareBrief(brief)
    if (result?.kind === 'copied') setShared(result.message)
    if (result?.kind === 'error') setShareError(result.message)
  }
  return <>
    <div class="chk-brief sb-brief">
      <div class="chk-brief-head">
        <div class="chk-brief-tag">Shop brief · {BAND_LABELS[brief.band]}</div>
        <h3 ref={headingRef} tabIndex={headingRef ? -1 : undefined}>{brief.vehicleLine}</h3>
        <div class="chk-brief-meta">{brief.metaLine}</div>
      </div>
      {brief.fairRange && <div class="chk-brief-sec chk-brief-fair"><div class="chk-brief-lbl">Fair range for this job</div><p class="chk-brief-amt">{brief.fairRange}</p>{brief.diyNote && <p class="chk-brief-foot">{brief.diyNote}</p>}<p class="chk-brief-foot">{brief.footerNote}</p></div>}
      <div class="chk-brief-sec"><div class="chk-brief-lbl">Item</div><p>{brief.title}</p></div>
      <div class="chk-brief-sec"><div class="chk-brief-lbl">Symptom, as the shop needs it</div><p>{brief.symptom}</p></div>
      <div class="chk-brief-sec"><div class="chk-brief-lbl">Ask the shop to</div><p>{capitalizedRequest}</p></div>
      {(brief.reasonableIfSuggested.length > 0 || brief.fineToDecline.length > 0) && <div class="sb-okdecline">
        {brief.reasonableIfSuggested.length > 0 && <div class="sb-ok"><div class="sb-odl">Fair if suggested</div><ul>{brief.reasonableIfSuggested.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        {brief.fineToDecline.length > 0 && <div class="sb-no"><div class="sb-odl">Fine to decline today</div><ul>{brief.fineToDecline.map((item) => <li key={item}>{item}</li>)}</ul></div>}
      </div>}
      {brief.escalationTriggers.length > 0 && <div class="chk-brief-sec"><div class="chk-brief-lbl">Gets urgent if</div><p>{brief.escalationTriggers.join(' · ')}</p></div>}
      {brief.historyNotes.length > 0 && <div class="chk-brief-sec chk-brief-note">{brief.historyNotes.map((note) => <p key={note}>{note}</p>)}</div>}
      {!brief.fairRange && <div class="chk-brief-sec chk-brief-note"><p>{brief.footerNote}</p></div>}
      <div class="chk-brief-share"><button type="button" class="btn btn-primary" onClick={onShare}>Share brief</button>{shared && <p class="notice notice-ok" role="status">{shared}</p>}{shareError && <p class="notice notice-error" role="alert">{shareError}</p>}</div>
    </div>
    <QuoteCheck brief={brief} />
  </>
}

const TONES: Record<QuoteRating, { cls: string; label: string }> = { reasonable: { cls: 'qc-ok', label: 'Looks reasonable' }, 'a-bit-high': { cls: 'qc-high', label: 'A bit high' }, 'worth-a-second-look': { cls: 'qc-flag', label: 'Worth a second look' }, 'no-anchor': { cls: 'qc-neutral', label: 'Amount not checked' } }

export function QuoteCheck({ brief }: { brief: ShopBrief }) {
  const [quoteRaw, setQuoteRaw] = useState('')
  const [checks, setChecks] = useState<DiagnosisCheck[]>(() => diagnosisChecksFromRequest(brief.request))
  const quoted = parseNumberInput(quoteRaw)
  const result = quoted != null && quoted > 0 ? checkQuote({ fairLow: brief.fairLow, fairHigh: brief.fairHigh, quotedTotal: quoted, diagnosisChecks: checks }) : null
  const midpoint = brief.fairLow != null && brief.fairHigh != null ? Math.round((brief.fairLow + brief.fairHigh) / 2) : undefined
  return <section class="qc"><h3 class="qc-title">Got a quote? Check it.</h3><p class="chk-sub">On your side of the counter — nothing here is saved or shared.</p>
    <label class="qc-field"><span class="qc-field-lbl">What did they quote?</span><span class="qc-input-wrap"><span class="qc-dollar" aria-hidden="true">$</span><input type="text" inputMode="decimal" class="qc-input" placeholder={midpoint ? String(midpoint) : 'Amount'} value={quoteRaw} onInput={(e) => setQuoteRaw((e.target as HTMLInputElement).value)} aria-label="Quoted total in dollars" /></span></label>
    {checks.length > 0 && <div class="qc-checks"><div class="qc-checks-lbl">Did the shop do these before quoting?</div>{checks.map((check) => <div key={check.id} class="qc-check"><span class="qc-check-label">{check.label}?</span><span class="qc-check-btns" role="group" aria-label={check.label}><button type="button" class={`qc-yn${check.done === true ? ' is-on' : ''}`} aria-pressed={check.done === true} onClick={() => setChecks((all) => all.map((item) => item.id === check.id ? { ...item, done: item.done === true ? null : true } : item))}>Yes</button><button type="button" class={`qc-yn qc-yn-no${check.done === false ? ' is-on' : ''}`} aria-pressed={check.done === false} onClick={() => setChecks((all) => all.map((item) => item.id === check.id ? { ...item, done: item.done === false ? null : false } : item))}>No</button></span></div>)}</div>}
    {result && <div class={`qc-result ${TONES[result.rating].cls}`} role="status"><div class="qc-rating"><span class="qc-dot" aria-hidden="true" />{TONES[result.rating].label}</div>{result.reasons.map((reason) => <p key={reason} class="qc-reason">{reason}</p>)}<div class="qc-script"><div class="qc-script-lbl">Worth asking</div><ul>{result.secondOpinionScript.map((item) => <li key={item}>{item}</li>)}</ul></div></div>}
  </section>
}
