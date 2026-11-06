import _ from 'lodash'
import { Type } from 'typebox'
import { App } from './types'
import type { PluginOptions } from './schema'

// The NMEA 2000 buses the plugin can send to one at a time. A server that
// sends to one bus (SignalK/signalk-server#3283) lists each NMEA 2000
// connection that writes in the pipedprovider property value, with the event
// that sends to it. An older server lists none, and everything goes to every
// bus on nmea2000out, as before.

export interface Bus {
  id: string
  type: string
  eventNames: { nmea2000out: string }
  // Off: the connection leaves out what is sent on nmea2000out
  broadcast?: boolean
}

const isBus = (value: any): value is Bus =>
  typeof value?.id === 'string' &&
  typeof value.type === 'string' &&
  value.type.startsWith('NMEA2000') &&
  typeof value.eventNames?.nmea2000out === 'string'

// The plugin-wide output settings, beside the conversions'
export const OUTPUT_KEY = 'OUTPUT'

export function busList(app: App): Map<string, Bus> {
  const buses = new Map<string, Bus>()
  app.onPropertyValues?.('pipedprovider', (values) => {
    ;(values || []).forEach((propertyValue) => {
      if (isBus(propertyValue?.value)) {
        buses.set(propertyValue.value.id, propertyValue.value)
      }
    })
  })
  return buses
}

// The buses to choose from: those listed, for the admin UI's form, or any
// id, for checking saved settings, as a bus need not be connected yet
export const busesProperty = (ids: string[] | undefined, description: string) =>
  Type.Optional(
    Type.Array(ids ? Type.String({ enum: ids }) : Type.String(), {
      title: 'Send to these NMEA 2000 buses',
      description,
      uniqueItems: true
    })
  )

export const outputDescription =
  'None chosen: every NMEA 2000 bus. A conversion can choose its own.'
export const conversionBusesDescription =
  'None chosen: the buses chosen under Output to NMEA 2000, or every bus.'

// The buses chosen in saved settings, as app.readPluginOptions gives them
export function savedBuses(saved: unknown): string[] {
  const configuration = (saved as { configuration?: unknown })?.configuration
  if (!configuration || typeof configuration !== 'object') {
    return []
  }
  return _.uniq(
    Object.values(configuration).flatMap((settings) =>
      Array.isArray(settings?.nmea2000Buses)
        ? settings.nmea2000Buses.filter((id: unknown) => typeof id === 'string')
        : []
    )
  )
}

// The buses a conversion sends to, each once: its own choice, else the
// plugin-wide one; empty for every bus
export function chosenBuses(options: PluginOptions, optionKey: string) {
  const own = options[optionKey]?.nmea2000Buses
  const all = options[OUTPUT_KEY]?.nmea2000Buses
  const chosen = Array.isArray(own) && own.length > 0 ? own : all
  return Array.isArray(chosen) ? _.uniq(chosen as string[]) : []
}

export const bridgeProperty = Type.Optional(
  Type.Boolean({
    title: 'Bridge NMEA 2000 data between buses',
    description:
      'Send data that came from one NMEA 2000 bus to the others, never back to the bus it came from. Leave off when two connections are gateways on the same bus.',
    default: false
  })
)

// Whether data from one NMEA 2000 bus goes to the others: only when set, and
// only on a server that can send to one bus
export const bridges = (options: PluginOptions, buses: Map<string, Bus>) =>
  options[OUTPUT_KEY]?.bridgeNmea2000 === true && buses.size > 0

// The events a PGN for these buses is emitted on. With no bus listed, the
// server cannot send to one bus (or, while it starts, has no NMEA 2000
// connection yet), so the PGN goes to every bus. A chosen bus that is not
// listed when others are may still be starting, and gets its own event.
// Leaving out a bus means naming the others: the chosen ones, or every bus
// that takes what is sent to all.
export function busEvents(
  buses: Map<string, Bus>,
  chosen: string[],
  exclude: string[] = []
): string[] {
  if (buses.size === 0 || (chosen.length === 0 && exclude.length === 0)) {
    return ['nmea2000out']
  }
  const targets =
    chosen.length > 0
      ? chosen
      : [...buses.values()]
          .filter((bus) => bus.broadcast !== false)
          .map((bus) => bus.id)
  return targets
    .filter((id) => !exclude.includes(id))
    .map((id) => buses.get(id)?.eventNames.nmea2000out ?? `nmea2000out:${id}`)
}
