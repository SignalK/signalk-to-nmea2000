import { PGN_127250, DirectionReference } from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'

// No SID: a fixed one would tie every message to the same moment, so it
// goes out as not available
module.exports = (app: App, plugin: Plugin): Conversion => {
  return {
    pgn: 127250,
    title: 'TrueHeading (127250)',
    optionKey: 'TRUE_HEADING',
    keys: ['navigation.headingTrue'],
    callback: (heading: number): PGN_127250[] => {
      return [
        new PGN_127250({
          heading: heading,
          variation: undefined,
          reference: DirectionReference.True
        })
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
