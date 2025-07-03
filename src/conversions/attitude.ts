import { ServerAPI, Plugin} from '@signalk/server-api'
import { PGN_127257, PGN_127257Defaults, DcSource } from '@canboat/ts-pgns'

module.exports = (app:ServerAPI, plugin:Plugin) => {
  return {
    pgn: 127250,
    title: 'Attitude (127257)',
    optionKey: 'ATTITUDE',
    keys: [
      "navigation.attitude"
    ],
    callback: (attitude:any): PGN_127257[] => {
      return [{
        ...PGN_127257Defaults,
        fields: {
          sid: 87,
          pitch: attitude.pitch,
          yaw: attitude.yaw,
          roll: attitude.roll
        }
      }]
    },
    tests: [
      {
        input: [ { 
          "yaw": 1.8843,
          "pitch": 0.042,
          "roll": 0.042
        } ],
        expected: [ {
          "dst": 255,
          "fields": {
            "Pitch": 0.042,
            "Roll": 0.042,
            "SID": 87,
            "Yaw": 1.8843,
          },
          "pgn": 127257,
          "prio": 3
        }]
      }
    ]
  }
}
