

let pressMessage = (pres, src) => {
  return [{
    pgn: 130314,
    "Instance": 100,
    "Source": src,
    "Pressure": pres,
  }]
}

module.exports = (app, plugin) => {
  return [{
    pgn: 130314,
    title: 'Atmospheric Pressure (130314)',
    optionKey: 'PRESSURE_ATMOSPHERIC',
    keys: [
      "environment.outside.pressure"
    ],
    callback: (pressure) => {
      return pressMessage(pressure, 'Atmospheric')
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
