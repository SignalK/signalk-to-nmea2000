import { ServerAPI, Plugin} from '@signalk/server-api'
import { PGN_130310 } from '@canboat/ts-pgns'

module.exports = (app:ServerAPI, plugin:Plugin) => {
  return {
    title: 'Sea/Air Temp (130310)',
    optionKey: 'ENVIRONMENT_PARAMETERS_SEA',
    keys: ["environment.water.temperature", "environment.outside.temperature", "environment.outside.pressure"],
    callback: (water:number, air:number, pressure:number): PGN_130310[]|undefined => {
      try {
        return [
          new PGN_130310({
	    sid: 0xff,
	    waterTemperature: water,
	    outsideAmbientAirTemperature: air,
	    atmosphericPressure: pressure
          })
        ]
      } catch ( err ) {
        console.error(err)
      }
    },
    tests: [{
      input: [ 281.2, 291, 20100 ],
      expected: [{
        "prio": 5,
        "pgn": 130310,
        "dst": 255,
        "fields": {
          "Water Temperature": 281.2,
          "Outside Ambient Air Temperature": 291,
          "Atmospheric Pressure": 20100
        }
      }]
    }]
  }
}
