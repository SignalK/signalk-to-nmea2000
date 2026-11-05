import { PGN_130313, HumiditySource } from '@canboat/ts-pgns'
import { Type } from 'typebox'
import { App, Plugin, Conversion } from '../types'
import { type PluginOptions, settingsOf } from '../schema'

// 100 is what the plugin always sent before the instance could be set
const defaultInstance = 100

const humidityProperties = {
  instance: Type.Optional(
    Type.Integer({
      title: 'N2K Humidity Instance',
      description: 'Tells apart several humidity sensors',
      minimum: 0,
      maximum: 252,
      default: defaultInstance
    })
  )
}
const HumiditySettings = Type.Object(humidityProperties)

// The message the tests expect, in canboat's display names
const expectedHumidity =
  (optionKey: string, source: string, humidity: number) =>
  (testOptions: any) => ({
    prio: 5,
    pgn: 130313,
    dst: 255,
    fields: {
      Instance: testOptions[optionKey].instance ?? defaultInstance,
      Source: source,
      'Actual Humidity': humidity
    }
  })

const testOptions = (optionKey: string) => [
  { [optionKey]: { instance: 0 } },
  { [optionKey]: {} }
]

const instanceOf = (options: PluginOptions, optionKey: string) =>
  settingsOf(options, optionKey, HumiditySettings)?.instance ?? defaultInstance

module.exports = (app: App, plugin: Plugin): Conversion[] => {
  return [
    {
      pgn: 130313,
      title: 'Outside Humidity (PGN130313)',
      optionKey: 'HUMIDITY_OUTSIDE',
      // environment.outside.humidity is the Signal K schema path, and the one
      // n2k-signalk uses; relativeHumidity is kept for sources that send it
      keys: [
        'environment.outside.humidity',
        'environment.outside.relativeHumidity'
      ],
      properties: humidityProperties,
      testOptions: testOptions('HUMIDITY_OUTSIDE'),

      conversions: (options: PluginOptions) => {
        const instance = instanceOf(options, 'HUMIDITY_OUTSIDE')
        return [
          {
            keys: [
              'environment.outside.humidity',
              'environment.outside.relativeHumidity'
            ],
            callback: (
              humidity?: number | null,
              relativeHumidity?: number | null
            ): PGN_130313[] => [
              new PGN_130313({
                instance,
                source: HumiditySource.Outside,
                actualHumidity: humidity ?? relativeHumidity ?? undefined
              })
            ],
            tests: [
              {
                input: [0.5, undefined],
                expected: [expectedHumidity('HUMIDITY_OUTSIDE', 'Outside', 0.5)]
              },
              {
                input: [null, 0.6],
                expected: [expectedHumidity('HUMIDITY_OUTSIDE', 'Outside', 0.6)]
              }
            ]
          }
        ]
      }
    },
    {
      pgn: 130313,
      title: 'Inside Humidity (PGN130313)',
      optionKey: 'HUMIDITY_INSIDE',
      keys: ['environment.inside.relativeHumidity'],
      properties: humidityProperties,
      testOptions: testOptions('HUMIDITY_INSIDE'),

      conversions: (options: PluginOptions) => {
        const instance = instanceOf(options, 'HUMIDITY_INSIDE')
        return [
          {
            keys: ['environment.inside.relativeHumidity'],
            callback: (humidity: number): PGN_130313[] => [
              new PGN_130313({
                instance,
                source: HumiditySource.Inside,
                actualHumidity: humidity
              })
            ],
            tests: [
              {
                input: [1.0],
                expected: [expectedHumidity('HUMIDITY_INSIDE', 'Inside', 1.0)]
              }
            ]
          }
        ]
      }
    }
  ]
}
