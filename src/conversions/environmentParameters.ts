import { ServerAPI, Plugin} from '@signalk/server-api'
import { PGN_130311, PGN_130311Defaults } from '@canboat/ts-pgns'

module.exports = (app:ServerAPI, plugin:Plugin) => {
  return {
    pgns: [ 130311 ],
    title: 'Atmospheric Pressure (130311)',
    optionKey: 'ENVIRONMENT_PARAMETERS',
    keys: ["environment.outside.pressure"],

    callback: (pressure:number): PGN_130311[]|undefined => {
      try {
        return [
          {
            ...PGN_130311Defaults,
            fields: {
              temperatureSource: 0xff, // probably should not be PartOfPrimaryKey
              atmosphericPressure: pressure,
            }
          }
        ]
      } catch ( err ) {
        console.error(err)
      }
    },
    tests: [{
      input: [ 3507100 ],
      expected: [{
        "prio": 2,
        "pgn": 130311,
        "dst": 255,
        "fields": {
          "Atmospheric Pressure": 3507100
        }
      }]
    }]
  }
}
