
module.exports = (app, plugin) => {
  return {
    pgns: [ 128259 ],
    title: 'Speed (128259)',
    optionKey: 'SPEED',
    keys: ["navigation.speedThroughWater"],

    callback: (speed) => {
      try {
        return [
          {
            pgn: 128259,
            "Speed Water Referenced": speed,
          }
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
