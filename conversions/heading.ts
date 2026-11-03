import { PGN_127250, DirectionReference } from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'
import { withPriority } from '../pgn'

module.exports = (app: App, plugin: Plugin): Conversion => {
  return {
    pgn: 127250,
    title: 'Heading (127250)',
    optionKey: 'HEADINGv2',
    keys: ['navigation.headingMagnetic', 'navigation.magneticVariation'],
    callback: (heading: number, variation: number): PGN_127250[] => {
      return [
        withPriority(
          new PGN_127250({
            sid: 87,
            heading: heading,
            variation: variation,
            reference: DirectionReference.Magnetic
          })
        )
      ]
    },
    tests: [
      {
        input: [1.2, 0.7],
        expected: [
          {
            prio: 2,
            pgn: 127250,
            dst: 255,
            fields: {
              SID: 87,
              Heading: 1.2,
              Variation: 0.7,
              Reference: 'Magnetic'
            }
          }
        ]
      }
    ]
  }
}
