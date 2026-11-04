import { PGN_130311, TemperatureSource, HumiditySource } from '@canboat/ts-pgns'
import { Type } from 'typebox'
import { App, Plugin, Conversion } from '../types'
import { type PluginOptions, settingsOf } from '../schema'

const pressureKey = 'environment.outside.pressure'
// environment.outside.humidity is the Signal K schema path;
// relativeHumidity is kept for sources that send it, as in humidity.js
const temperatureHumidityKeys = [
  'environment.outside.temperature',
  'environment.outside.humidity',
  'environment.outside.relativeHumidity'
]

const environmentProperties = {
  temperatureAndHumidity: Type.Optional(
    Type.Boolean({
      title: 'Also send outside temperature and humidity',
      description:
        'For displays that read them from 130311 rather than 130312/130313, such as the Raymarine i70s. Nothing is sent while any of these values comes from NMEA 2000.',
      default: false
    })
  )
}
const EnvironmentSettings = Type.Object(environmentProperties)

module.exports = (app: App, plugin: Plugin): Conversion => {
  return {
    pgns: [130311],
    title: 'Environmental Parameters (130311)',
    optionKey: 'ENVIRONMENT_PARAMETERS',
    keys: [pressureKey, ...temperatureHumidityKeys],
    properties: environmentProperties,

    testOptions: [
      { ENVIRONMENT_PARAMETERS: {} },
      { ENVIRONMENT_PARAMETERS: { temperatureAndHumidity: true } }
    ],

    conversions: (options: PluginOptions): Conversion[] => {
      const settings = settingsOf(
        options,
        'ENVIRONMENT_PARAMETERS',
        EnvironmentSettings
      )
      if (!settings?.temperatureAndHumidity) {
        return [
          {
            keys: [pressureKey],
            callback: (pressure: number): PGN_130311[] => [
              new PGN_130311({
                // Not available: this callback has no temperature source
                temperatureSource: undefined as unknown as TemperatureSource,
                atmosphericPressure: pressure
              })
            ],
            tests: [
              {
                input: [3507100],
                expected: [
                  {
                    prio: 5,
                    pgn: 130311,
                    dst: 255,
                    fields: {
                      'Atmospheric Pressure': 3507100
                    }
                  }
                ]
              }
            ]
          }
        ]
      }

      return [
        {
          keys: [pressureKey, ...temperatureHumidityKeys],
          callback: (
            pressure?: number | null,
            temperature?: number | null,
            humidity?: number | null,
            relativeHumidity?: number | null
          ): PGN_130311[] => {
            humidity = humidity ?? relativeHumidity
            return [
              new PGN_130311({
                temperatureSource: (temperature == null
                  ? undefined
                  : TemperatureSource.OutsideTemperature) as TemperatureSource,
                humiditySource:
                  humidity == null ? undefined : HumiditySource.Outside,
                temperature: temperature ?? undefined,
                humidity: humidity ?? undefined,
                atmosphericPressure: pressure ?? undefined
              })
            ]
          },
          tests: [
            {
              input: [101300, 291.2, 0.64, null],
              expected: [
                {
                  prio: 5,
                  pgn: 130311,
                  dst: 255,
                  fields: {
                    'Temperature Source': 'Outside Temperature',
                    'Humidity Source': 'Outside',
                    Temperature: 291.2,
                    Humidity: 0.64,
                    'Atmospheric Pressure': 101300
                  }
                }
              ]
            },
            {
              // relativeHumidity when humidity is not there, and no pressure
              input: [null, null, null, 0.5],
              expected: [
                {
                  prio: 5,
                  pgn: 130311,
                  dst: 255,
                  fields: {
                    'Humidity Source': 'Outside',
                    Humidity: 0.5
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  }
}
