import { ServerAPI, Plugin} from '@signalk/server-api'
import { PGN_128000, PGN_128000Defaults } from '@canboat/ts-pgns'

module.exports = (app:ServerAPI, plugin:Plugin) => {
  return {
    pgns: [ 128000 ],
    title: 'Leeway (128000)',
    optionKey: 'LEEWAY',
    keys: ["performance.leeway"],

    callback: (leeway:number): PGN_128000[]|undefined => {
      try {
        return [
          {
            ...PGN_128000Defaults,
            fields: {
              leewayAngle: leeway,
            }
          }
        ]
      } catch ( err ) {
        console.error(err)
      }
    },
    tests: [{
      input: [ 0.24 ],
      expected: [{
        "prio": 2,
        "pgn": 128000,
        "dst": 255,
        "fields": {
          "Leeway Angle": 0.24
        }
      }]
    }]
  }
}
