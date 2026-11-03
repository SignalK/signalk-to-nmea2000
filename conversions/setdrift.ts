import { PGN_129291 } from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'
import { withPriority } from '../pgn'

module.exports = (app: App, plugin: Plugin): Conversion => {
  return {
    title: 'Set/Drift (129291)',
    optionKey: 'SetDrift',
    keys: ['environment.current.setTrue', 'environment.current.drift'],
    callback: (set: number, drift: number): PGN_129291[] | undefined => {
      try {
        return [
          withPriority(
            new PGN_129291({
              set: set,
              drift: drift,
              setReference: 0
            })
          )
        ]
      } catch (err) {
        console.error(err)
      }
    },

    tests: [
      {
        input: [2.0944, 1.2],
        expected: [
          {
            pgn: 129291,
            dst: 255,
            prio: 2,
            fields: {
              Drift: 1.2,
              Set: 2.0944,
              'Set Reference': 'True'
            }
          }
        ]
      },
      {
        input: [1.0944, 1.5],
        expected: [
          {
            pgn: 129291,
            dst: 255,
            prio: 2,
            fields: {
              Drift: 1.5,
              Set: 1.0944,
              'Set Reference': 'True'
            }
          }
        ]
      }
    ]
  }
}
