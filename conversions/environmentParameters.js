
module.exports = (app, plugin) => {
  return {
    pgns: [ 130311 ],
    title: 'Atmospheric Pressure (130311)',
    optionKey: 'ENVIRONMENT_PARAMETERS',
    keys: ["environment.outside.pressure"],

    callback: (pressure) => {
      try {
        return [
          {
            pgn: 130311,
            "Atmospheric Pressure": pressure,
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
