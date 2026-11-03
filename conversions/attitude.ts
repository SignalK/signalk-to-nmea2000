import { PGN_127257 } from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'
import { withPriority } from '../pgn'

module.exports = (app: App, plugin: Plugin): Conversion => {
  return {
    pgn: 127250,
    title: 'Attitude (127257)',
    optionKey: 'ATTITUDE',
    keys: ['navigation.attitude'],
    callback: (attitude: {
      pitch?: number
      yaw?: number
      roll?: number
    }): PGN_127257[] => {
      return [
        withPriority(
          new PGN_127257({
            sid: 87,
            pitch: attitude.pitch,
            yaw: attitude.yaw,
            roll: attitude.roll
          })
        )
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
              SID: 87,
              Yaw: 1.8843
            },
            pgn: 127257,
            prio: 2
          }
        ]
      }
    ]
  }
}
