
module.exports = (app, plugin) => {
  return {
    pgns: [ 128000 ],
    title: 'Leeway (128000)',
    optionKey: 'LEEWAY',
    keys: ["performance.leeway"],

    callback: (leeway) => {
      try {
        return [
          {
            pgn: 128000,
            "Leeway Angle": leeway,
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
