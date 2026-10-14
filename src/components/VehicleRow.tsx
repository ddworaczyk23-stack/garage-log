import type { ComponentChildren } from 'preact'
import { vehicleLabel } from '../domain/vehicle'
import type { Vehicle } from '../types'
import { ChevronRightIcon, VehicleIcon } from './icons'

// The ONE vehicle row: icon tile, name, year/make/model, optional status,
// chevron. Used wherever a list of cars is a choice (Vehicles, Check picker)
// so the same car always looks the same.
export function VehicleRow({
  vehicle: v,
  href,
  status,
}: {
  vehicle: Pick<Vehicle, 'name' | 'nickname' | 'year' | 'make' | 'model'>
  href: string
  status?: ComponentChildren
}) {
  return (
    <a class="list-row vehicle-row" href={href}>
      <span class="vehicle-emoji" aria-hidden="true">
        <VehicleIcon />
      </span>
      <span class="list-row-main">
        <span class="list-row-title">{vehicleLabel(v)}</span>
        <span class="muted small">
          {v.year} {v.make} {v.model}
        </span>
      </span>
      {status}
      <ChevronRightIcon />
    </a>
  )
}
