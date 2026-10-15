import type { VehicleTraits } from '../db/traitTemplates'

const DRIVETRAINS = ['FWD', 'RWD', 'AWD', '4WD'] as const
const POWER_OPTIONS = [['gas', 'Gas'], ['turbo', 'Turbo gas'], ['diesel', 'Diesel'], ['hybrid', 'Hybrid'], ['ev', 'Electric']] as const
const TRANS_OPTIONS = [['auto', 'Automatic'], ['cvt', 'CVT'], ['dct', 'Dual-clutch'], ['manual', 'Manual'], ['none', 'Not sure']] as const
const BELT_OPTIONS = [['yes', 'Yes'], ['no', 'No'], ['not-sure', 'Not sure']] as const

// The four schedule traits as chip pickers. Shared by "Add a car" (step 1) and
// the car page's "Change maintenance type" sheet, so both ask the same way.
// `drivetrain` is the display value ('FWD' … or '' for not set).
export function TraitPickers({ power, trans, belt, drivetrain, onPower, onTrans, onBelt, onDrive }: {
  power: VehicleTraits['power']; trans: VehicleTraits['trans']; belt: 'yes' | 'no' | 'not-sure'; drivetrain: string
  onPower: (value: VehicleTraits['power']) => void; onTrans: (value: VehicleTraits['trans']) => void
  onBelt: (value: 'yes' | 'no' | 'not-sure') => void; onDrive: (value: string) => void
}) {
  return <>
    <ChipPicker legend="Engine type" value={power} options={POWER_OPTIONS} onChange={(value) => onPower(value as VehicleTraits['power'])} />
    {power !== 'hybrid' && power !== 'ev' && <ChipPicker legend="Transmission" value={trans} options={TRANS_OPTIONS} onChange={(value) => onTrans(value as VehicleTraits['trans'])} />}
    {power !== 'ev' && <ChipPicker legend="Timing belt?" value={belt} options={BELT_OPTIONS} onChange={(value) => onBelt(value as 'yes' | 'no' | 'not-sure')} hint="Not sure? Check your manual. Most newer cars have a chain." />}
    <ChipPicker legend="Drivetrain — optional" value={drivetrain} options={DRIVETRAINS.map((value) => [value, value] as const)} onChange={(value) => onDrive(value === drivetrain ? '' : value)} />
  </>
}

function ChipPicker({ legend, value, options, onChange, hint }: { legend: string; value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void; hint?: string }) {
  return (
    <fieldset class="admin-field chip-field">
      <legend class="muted small">{legend}</legend>
      <div class="choice-chips">
        {options.map(([option, label]) => (
          <button
            key={option}
            type="button"
            class={`choice-chip${value === option ? ' is-on' : ''}`}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {label}
          </button>
        ))}
      </div>
      {hint && <span class="field-hint">{hint}</span>}
    </fieldset>
  )
}
