import { ServerAPI, Plugin} from '@signalk/server-api'
import { DirectionReference, PGN_129026 } from '@canboat/ts-pgns'
import _ from 'lodash'

module.exports = (app:ServerAPI, plugin:Plugin) => {
  var lastUpdate = null
  
  return {
    title: 'COG & SOG (129026)',
    optionKey: 'COG_SOGv2',
    keys: ["navigation.courseOverGroundTrue", "navigation.speedOverGround"],
    callback: (course:number, speed:number): PGN_129026[]|undefined => {
      try {
        return [
          new PGN_129026({
            cogReference: DirectionReference.True,
            cog: course,
            sog: speed
          })
        ]
      } catch ( err ) {
        console.error(err)
      }
    },
    tests: [{
      input: [ 2.1, 9 ],
      expected: [{
        "prio": 2,
        "pgn": 129026,
        "dst": 255,
        "fields": {
          "COG Reference": "True",
          "COG": 2.1,
          "SOG": 9
        }
      }]
    }]
  }
}
