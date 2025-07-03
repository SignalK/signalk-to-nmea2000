import { ServerAPI, Plugin} from '@signalk/server-api'
import {
  PGN_127250,
  PGN_127250Defaults,
  DirectionReference
} from '@canboat/ts-pgns'

module.exports = (app:ServerAPI, plugin:Plugin) => {
  return {
    pgn: 127250,
    title: 'TrueHeading (127250)',
    optionKey: 'TRUE_HEADING',
    keys: [
      "navigation.headingTrue"
    ],
    callback: (heading:number): PGN_127250[] => {
      return [{
        ...PGN_127250Defaults,
        fields: {
          sid: 87,
          heading: heading,
          reference: DirectionReference.True
        }
      }]
    },
    tests: [{
      input: [ 1.35, undefined ],
      expected: [{
        "prio": 2,
        "pgn": 127250,
        "dst": 255,
        "fields": {
          "SID": 87,
          "Heading": 1.35,
          "Variation": undefined,
          "Reference": "True"
        }
      }]
    }]
  }
}
