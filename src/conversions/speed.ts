import { ServerAPI, Plugin} from '@signalk/server-api'
import {
  PGN_128259
} from '@canboat/ts-pgns'

module.exports = (app:ServerAPI, plugin:Plugin) => {
  return {
    pgns: [ 128259 ],
    title: 'Speed (128259)',
    optionKey: 'SPEED',
    keys: ["navigation.speedThroughWater"],

    callback: (speed:number): PGN_128259[]|undefined => {
      try {
        return [
          new PGN_128259({
            speedWaterReferenced: speed,
          })
        ]
      } catch ( err ) {
        console.error(err)
      }
    },
    tests: [{
      input: [ 3 ],
      expected: [{
        "prio": 2,
        "pgn": 128259,
        "dst": 255,
        "fields": {
          "Speed Water Referenced": 3
        }
      }]
    }]
  }
}
