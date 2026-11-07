import { PGN_129026 } from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'
import { NAVIGATION_TIMEOUT } from '../timeouts'

module.exports = (app: App, plugin: Plugin): Conversion => {
  var lastUpdate = null

  return {
    title: 'COG & SOG (129026)',
    optionKey: 'COG_SOGv2',
    keys: ['navigation.courseOverGroundTrue', 'navigation.speedOverGround'],
    timeouts: [NAVIGATION_TIMEOUT, NAVIGATION_TIMEOUT],
    callback: (course: number, speed: number): PGN_129026[] | undefined => {
      try {
        return [
          new PGN_129026({
            cogReference: 0,
            cog: course,
            sog: speed
          })
        ]
      } catch (err) {
        console.error(err)
      }
    },
    tests: [
      {
        input: [2.1, 9],
        expected: [
          {
            prio: 2,
            pgn: 129026,
            dst: 255,
            fields: {
              'COG Reference': 'True',
              COG: 2.1,
              SOG: 9
            }
          }
        ]
      }
    ]
  }
}
