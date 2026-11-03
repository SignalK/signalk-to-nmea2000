import _ from 'lodash'
import { PGN_127508 } from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'
import { withPriority } from '../pgn'

interface Charger {
  signalkId: string
  instanceId: number
  panelInstanceId: number
}

module.exports = (app: App, plugin: Plugin): Conversion => {
  const solarKeys = ['voltage', 'current', 'panelCurrent', 'panelVoltage']

  return {
    title: 'Solar as Battery (127506 & 127508)',
    optionKey: 'SOLAR',
    context: 'vessels.self',
    properties: () => {
      const chargerIds =
        typeof app.getSelfPath === 'function'
          ? Object.keys(app.getSelfPath('electrical.solar') || {}).filter(
              (id) => id !== 'meta'
            )
          : []
      return {
        chargers: {
          title: 'Solar Mapping',
          type: 'array',
          items: {
            type: 'object',
            required: ['signalkId', 'instanceId', 'panelInstanceId'],
            properties: {
              signalkId: {
                title: 'Signal K Solar id',
                description:
                  'Pick a solar charger id currently present under electrical.solar or enter one manually',
                type: 'string',
                examples: chargerIds
              },
              instanceId: {
                title: 'NMEA2000 Battery Instance Id',
                description: 'Used for current/voltage',
                type: 'number'
              },
              panelInstanceId: {
                title: 'NMEA2000 Battery Panel Instance Id',
                description: 'Used for panel current/voltage',
                type: 'number'
              }
            }
          }
        }
      }
    },

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

    conversions: (options: any) => {
      if (!_.get(options, 'SOLAR.chargers')) {
        return null as unknown as Conversion[]
      }
      return options.SOLAR.chargers.map((charger: Charger) => {
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
                withPriority(
                  new PGN_127508({
                    instance: charger.instanceId,
                    voltage: voltage as number,
                    current: current as number
                  })
                )
              )
            }
            if (panelVoltage != null || panelCurrent != null) {
              res.push(
                withPriority(
                  new PGN_127508({
                    instance: charger.panelInstanceId,
                    voltage: panelVoltage as number,
                    current: panelCurrent as number
                  })
                )
              )
            }

            return res
          },
          tests: [
            {
              input: [13, 5, 2, 45.0],
              expected: [
                {
                  prio: 2,
                  pgn: 127508,
                  dst: 255,
                  fields: {
                    Instance: 10,
                    Voltage: 13,
                    Current: 5
                  }
                },
                {
                  prio: 2,
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
