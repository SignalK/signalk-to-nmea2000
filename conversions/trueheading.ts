import { PGN_127250, DirectionReference } from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'
import { withPriority } from '../pgn'

module.exports = (app: App, plugin: Plugin): Conversion => {
  return {
    pgn: 127250,
    title: 'TrueHeading (127250)',
    optionKey: 'TRUE_HEADING',
    keys: ['navigation.headingTrue'],
    callback: (heading: number): PGN_127250[] => {
      return [
        withPriority(
          new PGN_127250({
            sid: 87,
            heading: heading,
            variation: undefined,
            reference: DirectionReference.True
          })
        )
      ]
    },
    tests: [
      {
        input: [1.35, undefined],
        expected: [
          {
            prio: 2,
            pgn: 127250,
            dst: 255,
            fields: {
              SID: 87,
              Heading: 1.35,
              Variation: undefined,
              Reference: 'True'
            }
          }
        ]
      }
    ]
  }
}
