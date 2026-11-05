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

// The buses a conversion sends to: its own choice, else the plugin-wide
// one; empty for every bus
export function chosenBuses(options: PluginOptions, optionKey: string) {
  const own = options[optionKey]?.nmea2000Buses
  if (Array.isArray(own) && own.length > 0) {
    return own as string[]
  }
  const all = options[OUTPUT_KEY]?.nmea2000Buses
  return Array.isArray(all) ? (all as string[]) : []
}

// The events a PGN for these buses is emitted on
export const busEvents = (buses: Map<string, Bus>, chosen: string[]) =>
  chosen.length === 0
    ? ['nmea2000out']
    : chosen.map(
        (id) => buses.get(id)?.eventNames.nmea2000out ?? `nmea2000out:${id}`
      )
