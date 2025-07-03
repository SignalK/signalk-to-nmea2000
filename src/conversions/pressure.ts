import { ServerAPI, Plugin} from '@signalk/server-api'
import { PGN_130314, PGN_130314Defaults, PressureSource } from '@canboat/ts-pgns'

let pressMessage = (pres:number, src:PressureSource) : PGN_130314[] => {
  return [{
    ...PGN_130314Defaults,
    fields: {
      instance: 100,
      source: src,
      pressure: pres,
    }
  }]
}

module.exports = (app:ServerAPI, plugin:Plugin) => {
  return [{
    pgn: 130314,
    title: 'Atmospheric Pressure (130314)',
    optionKey: 'PRESSURE_ATMOSPHERIC',
    keys: [
      "environment.outside.pressure"
    ],
    callback: (pressure:number) => {
      return pressMessage(pressure, PressureSource.Atmospheric)
    },
    tests: [{
      input: [ 103047.8 ],
      expected: [{
        "prio": 5,
        "pgn": 130314,
        "dst": 255,
        "fields": {
          "Instance": 100,
          "Source": "Atmospheric",
          "Pressure": 103047.8
        }
      }]
    }]
  }]
}
