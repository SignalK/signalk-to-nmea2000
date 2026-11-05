import {
  EngineStatus1,
  EngineStatus2,
  PGN_127488,
  PGN_127489,
  PGN_130312,
  PGN_130316,
  TemperatureSource
} from '@canboat/ts-pgns'
import { Type } from 'typebox'
import { App, Plugin, Conversion } from '../types'
import { type PluginOptions, settingsOf } from '../schema'
import { mappedInstance, withPriority } from '../pgn'

type Value = number | null | undefined

const orUndefined = (value: Value) => (value === null ? undefined : value)
const DEFAULT_TIMEOUT = 10000 // ms

// The Signal K notification for each discrete status, under
// notifications.propulsion.<engine>, as n2k-signalk names it when it decodes
// 127489. Each is paired with its ts-pgns status, so a status renamed in
// canboat fails the build.
const engineStatus1Paths: [string, EngineStatus1][] = [
  ['checkEngine', EngineStatus1.CheckEngine],
  ['overTemperature', EngineStatus1.OverTemperature],
  ['lowOilPressure', EngineStatus1.LowOilPressure],
  ['lowOilLevel', EngineStatus1.LowOilLevel],
  ['lowFuelPressure', EngineStatus1.LowFuelPressure],
  ['lowSystemVoltage', EngineStatus1.LowSystemVoltage],
  ['lowCoolantLevel', EngineStatus1.LowCoolantLevel],
  ['waterFlow', EngineStatus1.WaterFlow],
  ['waterInFuel', EngineStatus1.WaterInFuel],
  ['chargeIndicator', EngineStatus1.ChargeIndicator],
  ['preheatIndicator', EngineStatus1.PreheatIndicator],
  ['highBoostPressure', EngineStatus1.HighBoostPressure],
  ['revLimitExceeded', EngineStatus1.RevLimitExceeded],
  ['eGRSystem', EngineStatus1.EgrSystem],
  ['throttlePositionSensor', EngineStatus1.ThrottlePositionSensor],
  ['emergencyStopMode', EngineStatus1.EmergencyStop]
]

const engineStatus2Paths: [string, EngineStatus2][] = [
  ['warningLevel1', EngineStatus2.WarningLevel1],
  ['warningLevel2', EngineStatus2.WarningLevel2],
  ['powerReduction', EngineStatus2.PowerReduction],
  ['maintenanceNeeded', EngineStatus2.MaintenanceNeeded],
  ['commError', EngineStatus2.EngineCommError],
  ['subOrSecondaryThrottle', EngineStatus2.SubOrSecondaryThrottle],
  ['neutralStartProtect', EngineStatus2.NeutralStartProtect],
  ['shuttingDown', EngineStatus2.EngineShuttingDown]
]

const engineStatus1 = engineStatus1Paths.map(([, status]) => status)
const engineStatus2 = engineStatus2Paths.map(([, status]) => status)

const statusSourceKeys = [...engineStatus1Paths, ...engineStatus2Paths].map(
  ([key, title]) => ({ key, title })
)

const notificationSourceProperties = Object.fromEntries(
  statusSourceKeys.map(({ key, title }) => [
    key,
    Type.Optional(
      Type.String({
        title: `Source for ${title}`,
        description:
          'Use data only from this source (leave blank to accept any source except NMEA 2000)'
      })
    )
  ])
)

const engineProperties = {
  engines: Type.Optional(
    Type.Array(
      Type.Object({
        signalkId: Type.Optional(Type.String({ title: 'Signal K engine id' })),
        instanceId: Type.Optional(
          Type.Number({ title: 'NMEA2000 Engine Instance Id' })
        ),
        notificationSources: Type.Optional(
          Type.Object(notificationSourceProperties, {
            title: 'Notification Sources',
            description:
              'Select which source to use for each engine notification. Notifications from NMEA 2000 come from an engine that already sends this PGN: left blank, they are ignored; picking an NMEA 2000 source here stops this plugin sending the PGN for this engine while that source has the notification. "Also send data that came from NMEA 2000" turns both off.'
          })
        )
      }),
      { title: 'Engine Mapping' }
    )
  )
}
const EngineSettings = Type.Object(engineProperties)

const exhaustProperties = {
  engines: Type.Optional(
    Type.Array(
      Type.Object({
        signalkId: Type.Optional(Type.String({ title: 'Signal K engine id' })),
        tempInstanceId: Type.Optional(
          Type.Number({ title: 'NMEA2000 Temperature Instance Id' })
        )
      }),
      { title: 'Engine Mapping' }
    )
  )
}
const ExhaustSettings = Type.Object(exhaustProperties)

const isActiveStatus = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  'state' in value &&
  typeof value.state === 'string' &&
  value.state !== 'normal' &&
  value.state !== 'nominal'

const activeEngineStatuses = <T extends string>(
  statuses: readonly T[],
  values: unknown[]
): T[] =>
  statuses.flatMap((status, index) =>
    isActiveStatus(values[index]) ? [status] : []
  )

module.exports = (app: App, plugin: Plugin): Conversion[] => {
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
      properties: engineProperties,

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

      conversions: (options: PluginOptions) => {
        const settings = settingsOf(
          options,
          'ENGINE_PARAMETERS',
          EngineSettings
        )
        if (!settings?.engines) {
          return undefined
        }
        const engines = settings.engines
        const dyn: Conversion[] = engines.map((engine) => {
          const statusKeys = statusSourceKeys.map(
            ({ key }) => `notifications.propulsion.${engine.signalkId}.${key}`
          )
          const sourceSelectors = Object.fromEntries(
            statusSourceKeys.map(({ key }) => [
              `notifications.propulsion.${engine.signalkId}.${key}`,
              engine.notificationSources?.[key]
            ])
          )
          const measurementKeys = engParKeys.map(
            (key) => `propulsion.${engine.signalkId}.${key}`
          )
          const timeouts: (number | undefined)[] = [
            ...engParKeys.map(() => DEFAULT_TIMEOUT),
            ...statusKeys.map(() => undefined)
          ]
          // Whether the last 127489 sent had an active status, so clearing
          // it is sent even without a reading
          let sentActiveStatus = false
          return {
            keys: measurementKeys.concat(statusKeys),
            timeouts,
            withholdingKeys: measurementKeys,
            withholdingSourceKeys: statusKeys,
            initialValueKeys: statusKeys,
            sourceSelectors,
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
              engTorque: Value,
              ...statusValues: unknown[]
            ): PGN_127489[] => {
              const readings = [
                oilPres,
                oilTemp,
                temp,
                altVolt,
                fuelRate,
                runTime,
                coolPres,
                fuelPres,
                engLoad,
                engTorque
              ]
              const discreteStatus1 = activeEngineStatuses(
                engineStatus1,
                statusValues
              )
              const discreteStatus2 = activeEngineStatuses(
                engineStatus2,
                statusValues.slice(engineStatus1.length)
              )
              // Without a current reading, only an active status, or the clearing
              // of one, is worth sending: a notification that is normal, or
              // absent, would put an engine with every field "not available"
              // on the bus
              const activeStatus =
                discreteStatus1.length > 0 || discreteStatus2.length > 0
              const clearsStatus = sentActiveStatus && !activeStatus
              if (
                readings.every((reading) => reading == null) &&
                !activeStatus &&
                !clearsStatus
              ) {
                return []
              }
              sentActiveStatus = activeStatus
              return [
                withPriority(
                  new PGN_127489({
                    instance: mappedInstance(engine.instanceId),
                    // canboatjs 4 takes every value in SI, as Signal K gives it.
                    oilPressure: orUndefined(oilPres),
                    oilTemperature: orUndefined(oilTemp),
                    temperature: orUndefined(temp),
                    alternatorPotential: orUndefined(altVolt),
                    fuelRate: orUndefined(fuelRate),
                    totalEngineHours: orUndefined(runTime),
                    coolantPressure: orUndefined(coolPres),
                    fuelPressure: orUndefined(fuelPres),
                    discreteStatus1,
                    discreteStatus2,
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
              },
              {
                input: [
                  102700,
                  363.15,
                  353.15,
                  13.1,
                  0.0000277778,
                  201123,
                  120000,
                  350000,
                  0.5,
                  1.0,
                  null,
                  null,
                  { state: 'alarm' },
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  null,
                  { state: 'warn' },
                  null,
                  null,
                  null,
                  null
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
                      'Discrete Status 1': ['Low Oil Pressure'],
                      'Discrete Status 2': ['Maintenance Needed'],
                      'Engine Load': 0.5,
                      'Engine Torque': 1
                    }
                  }
                ]
              }
            ]
          }
        })

        const rapid: Conversion[] = engines.map((engine) => {
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
                    instance: mappedInstance(engine.instanceId),
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
        })

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
    properties: exhaustProperties,

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

    conversions: (options: PluginOptions) => {
      const settings = settingsOf(options, optionKey, ExhaustSettings)
      if (!settings?.engines) {
        return undefined
      }
      return settings.engines.map((engine) => {
        return {
          keys: [`propulsion.${engine.signalkId}.exhaustTemperature`],
          callback: (temperature: number): (PGN_130312 | PGN_130316)[] => {
            const common = {
              sid: 0xff,
              instance: mappedInstance(engine.tempInstanceId),
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
