import { PGN_127508 } from '@canboat/ts-pgns'
import { Type } from 'typebox'
import { App, Plugin, Conversion } from '../types'
import { type PluginOptions, settingsOf } from '../schema'

const solarProperties = (ids: string[]) => ({
  chargers: Type.Optional(
    Type.Array(
      Type.Object({
        signalkId: Type.String({
          title: 'Signal K Solar id',
          description:
            'Pick a solar charger id currently present under electrical.solar or enter one manually',
          examples: ids
        }),
        instanceId: Type.Number({
          title: 'NMEA2000 Battery Instance Id',
          description: 'Used for current/voltage'
        }),
        panelInstanceId: Type.Number({
          title: 'NMEA2000 Battery Panel Instance Id',
          description: 'Used for panel current/voltage'
        })
      }),
      { title: 'Solar Mapping' }
    )
  )
})
const SolarSettings = Type.Object(solarProperties([]))

module.exports = (app: App, plugin: Plugin): Conversion => {
  const solarKeys = ['voltage', 'current', 'panelCurrent', 'panelVoltage']

  return {
    title: 'Solar as Battery (127506 & 127508)',
    optionKey: 'SOLAR',
    context: 'vessels.self',
    properties: () =>
      solarProperties(
        typeof app.getSelfPath === 'function'
          ? Object.keys(app.getSelfPath('electrical.solar') || {}).filter(
              (id) => id !== 'meta'
            )
          : []
      ),

    testOptions: {
      SOLAR: {
        chargers: [
          {
            signalkId: 'bimini',
            instanceId: 10,
            panelInstanceId: 11
          }
        ]
      }
    },

    conversions: (options: PluginOptions) => {
      const settings = settingsOf(options, 'SOLAR', SolarSettings)
      if (!settings?.chargers) {
        return null
      }
      return settings.chargers.map((charger) => {
        return {
          keys: solarKeys.map(
            (key) => `electrical.solar.${charger.signalkId}.${key}`
          ),
          timeouts: solarKeys.map((key) => 60000),
          callback: (
            voltage: number | null,
            current: number | null,
            panelCurrent: number | null,
            panelVoltage: number | null
          ): PGN_127508[] => {
            var res: PGN_127508[] = []
            if (voltage != null || current != null) {
              res.push(
                new PGN_127508({
                  instance: charger.instanceId,
                  voltage: voltage as number,
                  current: current as number
                })
              )
            }
            if (panelVoltage != null || panelCurrent != null) {
              res.push(
                new PGN_127508({
                  instance: charger.panelInstanceId,
                  voltage: panelVoltage as number,
                  current: panelCurrent as number
                })
              )
            }

            return res
          },
          tests: [
            {
              input: [13, 5, 2, 45.0],
              expected: [
                {
                  prio: 6,
                  pgn: 127508,
                  dst: 255,
                  fields: {
                    Instance: 10,
                    Voltage: 13,
                    Current: 5
                  }
                },
                {
                  prio: 6,
                  pgn: 127508,
                  dst: 255,
                  fields: {
                    Instance: 11,
                    Voltage: 45,
                    Current: 2
                  }
                }
              ]
            }
          ]
        }
      })
    }
  }
}
