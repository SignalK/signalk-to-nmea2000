

import { PGN_130314, PressureSource } from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'
import { withPriority } from '../pgn'

let pressMessage = (pres: number, src: PressureSource): PGN_130314[] => {
  return [withPriority(new PGN_130314({
    instance: 100,
    source: src,
    pressure: pres
  }))]
}

module.exports = (app: App, plugin: Plugin): Conversion[] => {
  return [{
    pgn: 130314,
    title: 'Atmospheric Pressure (130314)',
    optionKey: 'PRESSURE_ATMOSPHERIC',
    keys: [
      "environment.outside.pressure"
    ],
    callback: (pressure: number) => {
      return pressMessage(pressure, PressureSource.Atmospheric)
    },
    tests: [{
      input: [ 103047.8 ],
      expected: [{
        "prio": 2,
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
