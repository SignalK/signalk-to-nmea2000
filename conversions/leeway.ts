import { PGN_128000 } from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'
import { withPriority } from '../pgn'

module.exports = (app: App, plugin: Plugin): Conversion => {
  return {
    pgns: [128000],
    title: 'Leeway (128000)',
    optionKey: 'LEEWAY',
    keys: ['performance.leeway'],

    callback: (leeway: number): PGN_128000[] | undefined => {
      try {
        return [
          withPriority(
            new PGN_128000({
              leewayAngle: leeway
            })
          )
        ]
      } catch (err) {
        console.error(err)
      }
    },
    tests: [
      {
        input: [0.24],
        expected: [
          {
            prio: 2,
            pgn: 128000,
            dst: 255,
            fields: {
              'Leeway Angle': 0.24
            }
          }
        ]
      }
    ]
  }
}
