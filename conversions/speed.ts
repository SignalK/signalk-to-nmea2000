import { PGN_128259 } from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'

module.exports = (app: App, plugin: Plugin): Conversion => {
  return {
    pgns: [128259],
    title: 'Speed (128259)',
    optionKey: 'SPEED',
    keys: ['navigation.speedThroughWater'],

    callback: (speed: number): PGN_128259[] | undefined => {
      try {
        return [
          new PGN_128259({
            speedWaterReferenced: speed
          })
        ]
      } catch (err) {
        console.error(err)
      }
    },
    tests: [
      {
        input: [3],
        expected: [
          {
            prio: 2,
            pgn: 128259,
            dst: 255,
            fields: {
              'Speed Water Referenced': 3
            }
          }
        ]
      }
    ]
  }
}
