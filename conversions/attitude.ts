import { PGN_127257 } from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'

// No SID: a fixed one would tie every message to the same moment, so it
// goes out as not available
module.exports = (app: App, plugin: Plugin): Conversion => {
  return {
    pgn: 127257,
    title: 'Attitude (127257)',
    optionKey: 'ATTITUDE',
    keys: ['navigation.attitude'],
    callback: (attitude: {
      pitch?: number
      yaw?: number
      roll?: number
    }): PGN_127257[] => {
      return [
        new PGN_127257({
          pitch: attitude.pitch,
          yaw: attitude.yaw,
          roll: attitude.roll
        })
      ]
    },
    tests: [
      {
        input: [
          {
            yaw: 1.8843,
            pitch: 0.042,
            roll: 0.042
          }
        ],
        expected: [
          {
            dst: 255,
            fields: {
              Pitch: 0.042,
              Roll: 0.042,
              Yaw: 1.8843
            },
            pgn: 127257,
            prio: 3
          }
        ]
      }
    ]
  }
}
