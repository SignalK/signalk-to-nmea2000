import { ServerAPI, Plugin} from '@signalk/server-api'
import {
  PGN_130306,
  WindReference
} from '@canboat/ts-pgns'

module.exports = (app:ServerAPI, plugin:Plugin) => {
  return {
    title: 'Wind (130306)',
    optionKey: 'WINDv2',
    keys: ["environment.wind.angleApparent", "environment.wind.speedApparent"],
    callback: (angle:number, speed:number): PGN_130306[]|undefined => {
      try {
        return [new PGN_130306({
          windSpeed: speed,
          windAngle: angle < 0 ? angle + Math.PI*2 : angle,
          reference: WindReference.Apparent
        })]
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
            'Reference': "Apparent"
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
            'Reference': "Apparent"
          }
        }
      ]
    }]
  }
}

