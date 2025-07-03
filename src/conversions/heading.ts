import { ServerAPI, Plugin} from '@signalk/server-api'
import { PGN_127250, PGN_127250Defaults, DirectionReference } from '@canboat/ts-pgns'

module.exports = (app:ServerAPI, plugin:Plugin) => {
  return {
    pgn: 127250,
    title: 'Heading (127250)',
    optionKey: 'HEADINGv2',
    keys: [
      "navigation.headingMagnetic",
      'navigation.magneticVariation'
    ],
    callback: (heading:number, variation:number): PGN_127250[] => {
      return [{
        ...PGN_127250Defaults,
        fields: {
          sid: 87,
          heading: heading,
          variation: variation,
          reference: DirectionReference.Magnetic
        }
      }]
    },
    tests: [{
      input: [ 1.2, 0.7 ],
      expected: [{
        "prio": 2,
        "pgn": 127250,
        "dst": 255,
        "fields": {
          "SID": 87,
          "Heading": 1.2,
          "Variation": 0.7,
          "Reference": "Magnetic"
        }
      }]
    }]
  }
}
