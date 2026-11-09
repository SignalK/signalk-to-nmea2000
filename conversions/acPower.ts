import _ from 'lodash'
import {
  PGN_127503,
  PGN_127504,
  PGN_127744,
  PGN_127747
} from '@canboat/ts-pgns'
import { Type } from 'typebox'
import { App, Plugin, Conversion } from '../types'
import { type PluginOptions, settingsOf } from '../schema'
import { mappedInstance } from '../pgn'

// The AC values per phase, as @signalk/path-metadata defines them for
// electrical.ac.<id>.phase.<phase> and electrical.inverters.<id>.ac
const acKeys = [
  'lineNeutralVoltage',
  'current',
  'frequency',
  'realPower',
  'reactivePower',
  'powerFactor'
]

// A phase of an AC bus is "single", or A, B and C; in NMEA 2000 they are
// lines 1 to 3
const phases = ['single', 'A', 'B', 'C']

const AC_TIMEOUT = 10000 // ms

const idsUnder = (app: App, path: string): string[] =>
  typeof app.getSelfPath === 'function'
    ? Object.keys(app.getSelfPath(path) || {}).filter((id) => id !== 'meta')
    : []

const mappingProperty = (
  title: string,
  idTitle: string,
  idDescription: string,
  ids: string[]
) =>
  Type.Optional(
    Type.Array(
      Type.Object({
        signalkId: Type.Optional(
          Type.String({
            title: idTitle,
            description: idDescription,
            examples: ids
          })
        ),
        instanceId: Type.Optional(
          Type.Number({ title: 'NMEA2000 AC Instance Id' })
        )
      }),
      { title }
    )
  )

const acInputProperties = (ids: string[]) => ({
  buses: mappingProperty(
    'AC Bus Mapping',
    'Signal K AC bus id',
    'Pick an AC bus id currently present under electrical.ac or enter one manually',
    ids
  ),
  phaseA: Type.Optional(
    Type.Boolean({
      title: 'Also send 127744 and 127747 (Phase A)',
      description:
        'For displays that read phase A (or a single phase) from 127744 (AC Power / Current) and 127747 (AC Voltage / Frequency)',
      default: false
    })
  )
})
const AcInputSettings = Type.Object(acInputProperties([]))

const acOutputProperties = (ids: string[]) => ({
  inverters: mappingProperty(
    'Inverter Mapping',
    'Signal K inverter id',
    'Pick an inverter id currently present under electrical.inverters or enter one manually',
    ids
  )
})
const AcOutputSettings = Type.Object(acOutputProperties([]))

// The power fields of 127503/127504 are unsigned, so power flowing back (or
// the negative reactive power of a capacitive load) cannot be sent there
const unsigned = (value: number | null | undefined) =>
  value == null || value < 0 ? undefined : value

// A phase without any values is left out of the list
// A line of 127503 or 127504, both of which name it 'Line 1' to 'Line 3'
interface AcLineFields {
  line: string
  voltage?: number
  current?: number
  frequency?: number
  realPower?: number
  reactivePower?: number
  powerFactor?: number
}

type AcValue = number | null | undefined

const acLine = (
  line: string,
  [
    voltage,
    current,
    frequency,
    realPower,
    reactivePower,
    powerFactor
  ]: AcValue[]
): AcLineFields | null => {
  if (
    [voltage, current, frequency, realPower, reactivePower, powerFactor].every(
      (v) => v == null
    )
  ) {
    return null
  }
  return {
    line: line,
    voltage: voltage ?? undefined,
    current: current ?? undefined,
    frequency: frequency ?? undefined,
    realPower: unsigned(realPower),
    reactivePower: unsigned(reactivePower),
    powerFactor: powerFactor ?? undefined
  }
}

module.exports = (app: App, plugin: Plugin): Conversion[] => {
  return [
    {
      title: 'AC Input (127503, 127744 & 127747)',
      optionKey: 'AC_INPUT',
      context: 'vessels.self',
      properties: () => acInputProperties(idsUnder(app, 'electrical.ac')),

      testOptions: {
        AC_INPUT: {
          buses: [{ signalkId: 'shore', instanceId: 2 }],
          phaseA: true
        }
      },

      conversions: (options: PluginOptions) => {
        const settings = settingsOf(options, 'AC_INPUT', AcInputSettings)
        if (!settings?.buses) {
          return undefined
        }
        return settings.buses.map((bus) => {
          const keys = phases.flatMap((phase) =>
            acKeys.map(
              (key) => `electrical.ac.${bus.signalkId}.phase.${phase}.${key}`
            )
          )
          return {
            keys,
            timeouts: keys.map(() => AC_TIMEOUT),
            callback: (
              ...values: AcValue[]
            ): (PGN_127503 | PGN_127744 | PGN_127747)[] => {
              const byPhase = _.chunk(values, acKeys.length)
              const single = acLine('Line 1', byPhase[0])
              const threePhase = [
                acLine('Line 1', byPhase[1]),
                acLine('Line 2', byPhase[2]),
                acLine('Line 3', byPhase[3])
              ]
              // A bus is either single phase or has phases A to C
              const lines = (
                threePhase.some((line) => line) ? threePhase : [single]
              ).filter((line): line is AcLineFields => line != null)
              if (lines.length == 0) {
                return []
              }

              const res: (PGN_127503 | PGN_127744 | PGN_127747)[] = [
                new PGN_127503({
                  instance: mappedInstance(bus.instanceId),
                  numberOfLines: lines.length,
                  // Signal K has no acceptability; this two-bit field reads as
                  // "Good" when it is not set
                  list: lines as PGN_127503['fields']['list']
                })
              ]

              // Power is signed in 127744, so it is sent as Signal K has it
              const [voltage, current, frequency, realPower] = threePhase[0]
                ? byPhase[1]
                : byPhase[0]
              if (settings.phaseA && lines[0].line == 'Line 1') {
                res.push(
                  new PGN_127744({
                    connectionNumber: bus.instanceId,
                    acRmsCurrent: current ?? undefined,
                    power: realPower ?? undefined
                  })
                )
                if (voltage != null || frequency != null) {
                  res.push(
                    new PGN_127747({
                      connectionNumber: bus.instanceId,
                      acVoltageLineToNeutral: voltage ?? undefined,
                      frequency: frequency ?? undefined
                    })
                  )
                }
              }
              return res
            },
            tests: [
              {
                // single phase shore power
                input: [
                  230.1,
                  12.3,
                  50,
                  2800,
                  150,
                  0.98,
                  ..._.times(18, () => null)
                ],
                expected: [
                  {
                    prio: 6,
                    pgn: 127503,
                    dst: 255,
                    fields: {
                      Instance: 2,
                      'Number of Lines': 1,
                      list: [
                        {
                          Line: 'Line 1',
                          Acceptability: 'Good',
                          Voltage: 230.1,
                          Current: 12.3,
                          Frequency: 50,
                          'Real Power': 2800,
                          'Reactive Power': 150,
                          'Power factor': 0.98
                        }
                      ]
                    }
                  },
                  {
                    prio: 3,
                    pgn: 127744,
                    dst: 255,
                    fields: {
                      'Connection Number': 2,
                      'AC RMS Current': 12.3,
                      Power: 2800
                    }
                  },
                  {
                    prio: 3,
                    pgn: 127747,
                    dst: 255,
                    fields: {
                      'Connection Number': 2,
                      'AC Voltage Line to Neutral': 230.1,
                      Frequency: 50
                    }
                  }
                ]
              },
              {
                // power fed back to shore, with a capacitive load
                input: [
                  230.1,
                  12.3,
                  50,
                  -2800,
                  -150,
                  0.98,
                  ..._.times(18, () => null)
                ],
                expected: [
                  {
                    prio: 6,
                    pgn: 127503,
                    dst: 255,
                    fields: {
                      Instance: 2,
                      'Number of Lines': 1,
                      list: [
                        {
                          Line: 'Line 1',
                          Acceptability: 'Good',
                          Voltage: 230.1,
                          Current: 12.3,
                          Frequency: 50,
                          'Power factor': 0.98
                        }
                      ]
                    }
                  },
                  {
                    prio: 3,
                    pgn: 127744,
                    dst: 255,
                    fields: {
                      'Connection Number': 2,
                      'AC RMS Current': 12.3,
                      Power: -2800
                    }
                  },
                  {
                    prio: 3,
                    pgn: 127747,
                    dst: 255,
                    fields: {
                      'Connection Number': 2,
                      'AC Voltage Line to Neutral': 230.1,
                      Frequency: 50
                    }
                  }
                ]
              },
              {
                // three phases, with only voltage and current
                input: [
                  ..._.times(6, () => null),
                  400.1,
                  5.1,
                  null,
                  null,
                  null,
                  null,
                  400.2,
                  5.2,
                  null,
                  null,
                  null,
                  null,
                  400.3,
                  5.3,
                  null,
                  null,
                  null,
                  null
                ],
                expected: [
                  {
                    prio: 6,
                    pgn: 127503,
                    dst: 255,
                    fields: {
                      Instance: 2,
                      'Number of Lines': 3,
                      list: [
                        {
                          Line: 'Line 1',
                          Acceptability: 'Good',
                          Voltage: 400.1,
                          Current: 5.1
                        },
                        {
                          Line: 'Line 2',
                          Acceptability: 'Good',
                          Voltage: 400.2,
                          Current: 5.2
                        },
                        {
                          Line: 'Line 3',
                          Acceptability: 'Good',
                          Voltage: 400.3,
                          Current: 5.3
                        }
                      ]
                    }
                  },
                  {
                    prio: 3,
                    pgn: 127744,
                    dst: 255,
                    fields: {
                      'Connection Number': 2,
                      'AC RMS Current': 5.1
                    }
                  },
                  {
                    prio: 3,
                    pgn: 127747,
                    dst: 255,
                    fields: {
                      'Connection Number': 2,
                      'AC Voltage Line to Neutral': 400.1
                    }
                  }
                ]
              },
              {
                // only the frequency: 127747 without a voltage
                input: [null, null, 50, ..._.times(21, () => null)],
                expected: [
                  {
                    prio: 6,
                    pgn: 127503,
                    dst: 255,
                    fields: {
                      Instance: 2,
                      'Number of Lines': 1,
                      list: [
                        {
                          Line: 'Line 1',
                          Acceptability: 'Good',
                          Frequency: 50
                        }
                      ]
                    }
                  },
                  {
                    prio: 3,
                    pgn: 127744,
                    dst: 255,
                    fields: { 'Connection Number': 2 }
                  },
                  {
                    prio: 3,
                    pgn: 127747,
                    dst: 255,
                    fields: { 'Connection Number': 2, Frequency: 50 }
                  }
                ]
              },
              {
                // only the current: no 127747
                input: [null, 12.3, ..._.times(22, () => null)],
                expected: [
                  {
                    prio: 6,
                    pgn: 127503,
                    dst: 255,
                    fields: {
                      Instance: 2,
                      'Number of Lines': 1,
                      list: [
                        {
                          Line: 'Line 1',
                          Acceptability: 'Good',
                          Current: 12.3
                        }
                      ]
                    }
                  },
                  {
                    prio: 3,
                    pgn: 127744,
                    dst: 255,
                    fields: { 'Connection Number': 2, 'AC RMS Current': 12.3 }
                  }
                ]
              },
              {
                // nothing known
                input: _.times(24, () => null),
                expected: []
              }
            ]
          }
        })
      }
    },
    {
      title: 'AC Output (127504)',
      optionKey: 'AC_OUTPUT',
      context: 'vessels.self',
      properties: () =>
        acOutputProperties(idsUnder(app, 'electrical.inverters')),

      testOptions: {
        AC_OUTPUT: {
          inverters: [{ signalkId: 'main', instanceId: 1 }]
        }
      },

      conversions: (options: PluginOptions) => {
        const settings = settingsOf(options, 'AC_OUTPUT', AcOutputSettings)
        if (!settings?.inverters) {
          return undefined
        }
        return settings.inverters.map((inverter) => {
          const keys = acKeys.map(
            (key) => `electrical.inverters.${inverter.signalkId}.ac.${key}`
          )
          return {
            keys,
            timeouts: keys.map(() => AC_TIMEOUT),
            callback: (...values: AcValue[]): PGN_127504[] => {
              const line = acLine('Line 1', values)
              if (!line) {
                return []
              }
              return [
                new PGN_127504({
                  instance: mappedInstance(inverter.instanceId),
                  numberOfLines: 1,
                  list: [line] as PGN_127504['fields']['list']
                })
              ]
            },
            tests: [
              {
                input: [229.8, 4.2, 50.01, 950, null, 0.95],
                expected: [
                  {
                    prio: 6,
                    pgn: 127504,
                    dst: 255,
                    fields: {
                      Instance: 1,
                      'Number of Lines': 1,
                      list: [
                        {
                          Line: 'Line 1',
                          Voltage: 229.8,
                          Current: 4.2,
                          Frequency: 50.01,
                          'Real Power': 950,
                          'Power factor': 0.95
                        }
                      ]
                    }
                  }
                ]
              },
              {
                input: [null, null, null, null, null, null],
                expected: []
              }
            ]
          }
        })
      }
    }
  ]
}
