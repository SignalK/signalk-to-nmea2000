import _ from 'lodash'
import {
  PGN_127488,
  PGN_127489,
  PGN_130312,
  PGN_130316,
  TemperatureSource
} from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'
import { withPriority } from '../pgn'

type Value = number | null | undefined

const orUndefined = (value: Value) => (value === null ? undefined : value)
const DEFAULT_TIMEOUT = 10000 // ms

interface EngineMapping {
  signalkId: string | number
  instanceId: number
}

interface TemperatureMapping {
  signalkId: string | number
  tempInstanceId: number
}

module.exports = (app: App, plugin: Plugin): Conversion[] => {
  // discrete status fields are not yet implemented
  const engParKeys = [
    'oilPressure',
    'oilTemperature',
    'temperature',
    'alternatorVoltage',
    'fuel.rate',
    'runTime',
    'coolantPressure',
    'fuel.pressure',
    'engineLoad',
    'engineTorque'
  ]

  const engRapidKeys = ['revolutions', 'boostPressure', 'drive.trimState']

  return [
    exhaustTemperature(130312, 'EXHAUST_TEMPERATURE'),
    exhaustTemperature(130316, 'EXHAUST_TEMPERATURE2'),
    {
      title: 'Engine Parameters (127489,127488)',
      optionKey: 'ENGINE_PARAMETERS',
      context: 'vessels.self',
      properties: {
        engines: {
          title: 'Engine Mapping',
          type: 'array',
          items: {
            type: 'object',
            properties: {
              signalkId: {
                title: 'Signal K engine id',
                type: 'string'
              },
              instanceId: {
                title: 'NMEA2000 Engine Instance Id',
                type: 'number'
              }
            }
          }
        }
      },

      testOptions: {
        ENGINE_PARAMETERS: {
          engines: [
            {
              signalkId: 0,
              instanceId: 1
            }
          ]
        }
      },

      conversions: (options: any) => {
        if (!_.get(options, 'ENGINE_PARAMETERS.engines')) {
          return undefined
        }
        const dyn = options.ENGINE_PARAMETERS.engines.map(
          (engine: EngineMapping) => {
            return {
              keys: engParKeys.map(
                (key) => `propulsion.${engine.signalkId}.${key}`
              ),
              timeouts: engParKeys.map((key) => DEFAULT_TIMEOUT),
              callback: (
                oilPres: Value,
                oilTemp: Value,
                temp: Value,
                altVolt: Value,
                fuelRate: Value,
                runTime: Value,
                coolPres: Value,
                fuelPres: Value,
                engLoad: Value,
                engTorque: Value
              ): PGN_127489[] => {
                return [
                  withPriority(
                    new PGN_127489({
                      instance: engine.instanceId,
                      // canboatjs 4 takes every value in SI, as Signal K gives it.
                      oilPressure: orUndefined(oilPres),
                      oilTemperature: orUndefined(oilTemp),
                      temperature: orUndefined(temp),
                      alternatorPotential: orUndefined(altVolt),
                      fuelRate: orUndefined(fuelRate),
                      totalEngineHours: orUndefined(runTime),
                      coolantPressure: orUndefined(coolPres),
                      fuelPressure: orUndefined(fuelPres),
                      discreteStatus1: [],
                      discreteStatus2: [],
                      engineLoad: orUndefined(engLoad),
                      engineTorque: orUndefined(engTorque)
                    })
                  )
                ]
              },
              tests: [
                {
                  // 102700 Pa, 363.15 K, 353.15 K, 13.1 V, 100 L/h (in m3/s),
                  // 201123 s, 120000 Pa, 350000 Pa, 50 % and 100 %.
                  input: [
                    102700, 363.15, 353.15, 13.1, 0.0000277778, 201123, 120000,
                    350000, 0.5, 1.0
                  ],
                  expected: [
                    {
                      prio: 2,
                      pgn: 127489,
                      dst: 255,
                      fields: {
                        Instance: 'Dual Engine Starboard',
                        'Oil pressure': 102700,
                        'Oil temperature': 363.1,
                        Temperature: 353.15,
                        'Alternator Potential': 13.1,
                        'Fuel Rate': 0.0000277778,
                        'Total Engine hours': 201123,
                        'Coolant Pressure': 120000,
                        'Fuel Pressure': 350000,
                        'Discrete Status 1': [],
                        'Discrete Status 2': [],
                        'Engine Load': 0.5,
                        'Engine Torque': 1
                      }
                    }
                  ]
                }
              ]
            }
          }
        )

        const rapid = options.ENGINE_PARAMETERS.engines.map(
          (engine: EngineMapping) => {
            return {
              keys: engRapidKeys.map(
                (key) => `propulsion.${engine.signalkId}.${key}`
              ),
              timeouts: engRapidKeys.map((key) => DEFAULT_TIMEOUT),
              callback: (
                revolutions: Value,
                boostPressure: Value,
                trimState: Value
              ): PGN_127488[] => {
                return [
                  withPriority(
                    new PGN_127488({
                      instance: engine.instanceId,
                      // canboatjs 4 takes Hz, Pa and a ratio, as Signal K gives them.
                      speed: orUndefined(revolutions),
                      boostPressure: orUndefined(boostPressure),
                      tiltTrim: orUndefined(trimState)
                    })
                  )
                ]
              },
              tests: [
                {
                  // 1800 rpm (30 Hz), 120000 Pa, 50 %.
                  input: [30, 120000, 0.5],
                  expected: [
                    {
                      prio: 2,
                      pgn: 127488,
                      dst: 255,
                      fields: {
                        Instance: 'Dual Engine Starboard',
                        Speed: 30,
                        'Boost Pressure': 120000,
                        'Tilt/Trim': 0.5
                      }
                    }
                  ]
                }
              ]
            }
          }
        )

        return dyn.concat(rapid)
      }
    }
  ]
}

// Exhaust gas temperature per engine. 130316 is the extended range version of
// 130312, which some displays (e.g. Raymarine Axiom) read instead.
function exhaustTemperature(
  pgn: 130312 | 130316,
  optionKey: string
): Conversion {
  const temperatureField = pgn == 130316 ? 'Temperature' : 'Actual Temperature'
  // 130312 goes up to 655.32 K, so test 130316 above that
  const testTemperature = pgn == 130316 ? 700 : 281.2
  return {
    title: `Temperature, exhaust (${pgn})`,
    optionKey,
    context: 'vessels.self',
    properties: {
      engines: {
        title: 'Engine Mapping',
        type: 'array',
        items: {
          type: 'object',
          properties: {
            signalkId: {
              title: 'Signal K engine id',
              type: 'string'
            },
            tempInstanceId: {
              title: 'NMEA2000 Temperature Instance Id',
              type: 'number'
            }
          }
        }
      }
    },

    testOptions: {
      [optionKey]: {
        engines: [
          {
            signalkId: 10,
            tempInstanceId: 1
          }
        ]
      }
    },

    conversions: (options: any) => {
      if (!_.get(options, [optionKey, 'engines'])) {
        return undefined
      }
      return options[optionKey].engines.map((engine: TemperatureMapping) => {
        return {
          keys: [`propulsion.${engine.signalkId}.exhaustTemperature`],
          callback: (temperature: number): (PGN_130312 | PGN_130316)[] => {
            const common = {
              sid: 0xff,
              instance: engine.tempInstanceId,
              source: TemperatureSource.ExhaustGasTemperature
            }
            return [
              withPriority(
                pgn == 130316
                  ? new PGN_130316({ ...common, temperature })
                  : new PGN_130312({
                      ...common,
                      actualTemperature: temperature
                    })
              )
            ]
          },
          tests: [
            {
              input: [testTemperature],
              expected: [
                {
                  prio: 2,
                  pgn: pgn,
                  dst: 255,
                  fields: {
                    Instance: 1,
                    [temperatureField]: testTemperature,
                    Source: 'Exhaust Gas Temperature'
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
