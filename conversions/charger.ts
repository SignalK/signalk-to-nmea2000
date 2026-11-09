import {
  PGN_127507,
  PGN_127508,
  ChargerState,
  ChargerMode
} from '@canboat/ts-pgns'
import { Type } from 'typebox'
import { App, Plugin, Conversion } from '../types'
import { type PluginOptions, settingsOf } from '../schema'

// A battery charger under electrical.chargers.<id>: its output as 127508
// Battery Status, the way Solar as Battery sends a solar charger, and its
// charging state as 127507 Charger Status.

const chargerProperties = (ids: string[]) => ({
  chargers: Type.Optional(
    Type.Array(
      Type.Object({
        signalkId: Type.String({
          title: 'Signal K charger id',
          description:
            'Pick a charger id currently present under electrical.chargers or enter one manually',
          examples: ids
        }),
        instanceId: Type.Integer({
          title: 'NMEA2000 Battery Instance Id',
          minimum: 0,
          maximum: 252,
          description:
            "Used for the charger's output voltage, current and temperature (127508), and as the battery it charges in 127507"
        }),
        chargerInstanceId: Type.Optional(
          Type.Integer({
            title: 'NMEA2000 Charger Instance Id',
            minimum: 0,
            maximum: 252,
            description: 'Used for the charging state (127507)'
          })
        )
      }),
      { title: 'Charger Mapping' }
    )
  )
})
const ChargerSettings = Type.Object(chargerProperties([]))

// Signal K's chargingMode, and the states chargers report in it, as the
// operating state of 127507
const chargerStates = new Map<string, ChargerState>(
  Object.entries({
    'not charging': ChargerState.NotCharging,
    off: ChargerState.NotCharging,
    bulk: ChargerState.Bulk,
    absorption: ChargerState.Absorption,
    acceptance: ChargerState.Absorption,
    overcharge: ChargerState.Overcharge,
    equalize: ChargerState.Equalise,
    equalise: ChargerState.Equalise,
    float: ChargerState.Float,
    storage: ChargerState.Float,
    'no float': ChargerState.NoFloat,
    'constant vi': ChargerState.ConstantVi,
    disabled: ChargerState.Disabled,
    fault: ChargerState.Fault
  })
)

const chargerState = (mode: unknown): ChargerState | undefined =>
  typeof mode === 'string' ? chargerStates.get(mode.toLowerCase()) : undefined

// Signal K's chargerRole as the charger mode of 127507; master and slave are
// the specification's older names
const chargerModes = new Map<string, ChargerMode>(
  Object.entries({
    standalone: ChargerMode.Standalone,
    primary: ChargerMode.Primary,
    master: ChargerMode.Primary,
    secondary: ChargerMode.Secondary,
    slave: ChargerMode.Secondary,
    echo: ChargerMode.Echo
  })
)

const chargerMode = (role: unknown): ChargerMode | undefined =>
  typeof role === 'string' ? chargerModes.get(role.toLowerCase()) : undefined

module.exports = (app: App, plugin: Plugin): Conversion => {
  const chargerKeys = [
    'voltage',
    'current',
    'temperature',
    'chargingMode',
    'chargerRole'
  ]

  return {
    title: 'Charger (127507 & 127508)',
    optionKey: 'CHARGERS',
    context: 'vessels.self',
    properties: () =>
      chargerProperties(
        typeof app.getSelfPath === 'function'
          ? Object.keys(app.getSelfPath('electrical.chargers') || {}).filter(
              (id) => id !== 'meta'
            )
          : []
      ),

    testOptions: {
      CHARGERS: {
        chargers: [
          { signalkId: 'shore', instanceId: 12, chargerInstanceId: 1 },
          { signalkId: 'solar', instanceId: 13 }
        ]
      }
    },

    conversions: (options: PluginOptions) => {
      const settings = settingsOf(options, 'CHARGERS', ChargerSettings)
      if (!settings?.chargers) {
        return null
      }
      return settings.chargers.map((charger) => ({
        keys: chargerKeys.map(
          (key) => `electrical.chargers.${charger.signalkId}.${key}`
        ),
        timeouts: chargerKeys.map(() => 60000),
        callback: (
          voltage: number | null,
          current: number | null,
          temperature: number | null,
          chargingMode: unknown,
          chargerRole?: unknown
        ): (PGN_127507 | PGN_127508)[] => {
          const res: (PGN_127507 | PGN_127508)[] = []
          if (voltage != null || current != null || temperature != null) {
            res.push(
              new PGN_127508({
                instance: charger.instanceId,
                voltage: voltage ?? undefined,
                current: current ?? undefined,
                temperature: temperature ?? undefined
              })
            )
          }
          const operatingState = chargerState(chargingMode)
          const chargerModeValue = chargerMode(chargerRole)
          if (
            charger.chargerInstanceId !== undefined &&
            (operatingState || chargerModeValue)
          ) {
            res.push(
              new PGN_127507({
                instance: charger.chargerInstanceId,
                batteryInstance: charger.instanceId,
                operatingState,
                chargeMode: chargerModeValue
              })
            )
          }
          return res
        },
        tests:
          charger.chargerInstanceId === undefined
            ? [
                {
                  // The charger instance is optional: without it there is nowhere to
                  // put the state
                  input: [14.1, 3.2, null, 'bulk'],
                  expected: [
                    {
                      prio: 6,
                      pgn: 127508,
                      dst: 255,
                      fields: { Instance: 13, Voltage: 14.1, Current: 3.2 }
                    }
                  ]
                }
              ]
            : [
                {
                  input: [13.8, 25.2, 301.15, 'absorption'],
                  expected: [
                    {
                      prio: 6,
                      pgn: 127508,
                      dst: 255,
                      fields: {
                        Instance: 12,
                        Voltage: 13.8,
                        Current: 25.2,
                        Temperature: 301.15
                      }
                    },
                    {
                      prio: 6,
                      pgn: 127507,
                      dst: 255,
                      fields: {
                        Instance: 1,
                        'Battery Instance': 12,
                        'Operating State': 'Absorption'
                      }
                    }
                  ]
                },
                {
                  // Signal K allows any mode; one 127507 cannot express must not
                  // stop the output
                  input: [13.2, 1.1, null, 'inverting'],
                  expected: [
                    {
                      prio: 6,
                      pgn: 127508,
                      dst: 255,
                      fields: {
                        Instance: 12,
                        Voltage: 13.2,
                        Current: 1.1
                      }
                    }
                  ]
                },
                {
                  // A charger that reports its mode before its readings
                  input: [null, null, null, 'Float'],
                  expected: [
                    {
                      prio: 6,
                      pgn: 127507,
                      dst: 255,
                      fields: {
                        Instance: 1,
                        'Battery Instance': 12,
                        'Operating State': 'Float'
                      }
                    }
                  ]
                },
                {
                  // As n2k-signalk writes 127507: canboat's names, lowercased
                  input: [null, null, null, 'constant vi', 'echo'],
                  expected: [
                    {
                      prio: 6,
                      pgn: 127507,
                      dst: 255,
                      fields: {
                        Instance: 1,
                        'Battery Instance': 12,
                        'Operating State': 'Constant VI',
                        'Charge Mode': 'Echo'
                      }
                    }
                  ]
                },
                {
                  // The role alone, by the specification's older name
                  input: [null, null, null, null, 'slave'],
                  expected: [
                    {
                      prio: 6,
                      pgn: 127507,
                      dst: 255,
                      fields: {
                        Instance: 1,
                        'Battery Instance': 12,
                        'Charge Mode': 'Secondary'
                      }
                    }
                  ]
                },
                {
                  // standby has no charger mode in 127507
                  input: [null, null, null, null, 'standby'],
                  expected: []
                },
                {
                  // A mode is looked up by name, so a name the lookup itself has
                  // must not be taken for a state
                  input: [null, null, null, 'constructor'],
                  expected: []
                },
                {
                  input: [null, null, null, '__proto__'],
                  expected: []
                }
              ]
      }))
    }
  }
}
