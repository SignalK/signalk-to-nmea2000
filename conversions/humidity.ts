import { PGN_130313, HumiditySource } from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'

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
      callback: (
        humidity?: number | null,
        relativeHumidity?: number | null
      ): PGN_130313[] => {
        return [
          new PGN_130313({
            instance: 100,
            source: HumiditySource.Outside,
            actualHumidity: humidity ?? relativeHumidity ?? undefined
          })
        ]
      },
      tests: [
        {
          input: [0.5, undefined],
          expected: [
            {
              prio: 5,
              pgn: 130313,
              dst: 255,
              fields: {
                Instance: 100,
                Source: 'Outside',
                'Actual Humidity': 0.5
              }
            }
          ]
        },
        {
          input: [null, 0.6],
          expected: [
            {
              prio: 5,
              pgn: 130313,
              dst: 255,
              fields: {
                Instance: 100,
                Source: 'Outside',
                'Actual Humidity': 0.6
              }
            }
          ]
        }
      ]
    },
    {
      pgn: 130313,
      title: 'Inside Humidity (PGN130313)',
      optionKey: 'HUMIDITY_INSIDE',
      keys: ['environment.inside.relativeHumidity'],
      callback: (humidity: number): PGN_130313[] => {
        return [
          new PGN_130313({
            instance: 100,
            source: HumiditySource.Inside,
            actualHumidity: humidity
          })
        ]
      },
      tests: [
        {
          input: [1.0],
          expected: [
            {
              prio: 5,
              pgn: 130313,
              dst: 255,
              fields: {
                Instance: 100,
                Source: 'Inside',
                'Actual Humidity': 1.0
              }
            }
          ]
        }
      ]
    }
  ]
}
