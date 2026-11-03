
import { PGN_130306 } from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'
import { withPriority } from '../pgn'

module.exports = (app: App, plugin: Plugin): Conversion => {
  return {
    title: 'Wind True over ground (130306)',
    optionKey: 'WIND_TRUE_GROUND',
    keys: ["environment.wind.directionTrue", "environment.wind.speedOverGround"],
    callback: (angle: number, speed: number): PGN_130306[] | undefined => {
      try {
        return [
          withPriority(
            new PGN_130306({
              windSpeed: speed,
              windAngle: angle < 0 ? angle + Math.PI*2 : angle,
              reference: 0
            })
          )
        ]
      } catch ( err ) {
        console.error(err)
      }
    },
    tests: [{
      input: [ 2.0944, 1.2 ],
      expected: [
        {
          pgn: 130306,
          dst: 255,
          prio: 2,
          fields: {
            'Wind Speed': 1.2,
            'Wind Angle': 2.0944,
            'Reference': "True (ground referenced to North)"
          }
        }
      ]
    },{
      input: [ -2.0944, 1.5 ],
      expected: [
        {
          pgn: 130306,
          dst: 255,
          prio: 2,
          fields: {
            'Wind Speed': 1.5,
            'Wind Angle': 4.1888,
            'Reference': "True (ground referenced to North)"
          }
        }
      ]
    }]
  }
}
