
module.exports = (app, plugin) => {
  return [{
    pgn: 130313,
    title: 'Outside Humidity (PGN130313)',
    optionKey: 'HUMIDITY_OUTSIDE',
    keys: [
      "environment.outside.relativeHumidity"
    ],
    callback: (humidity) => {
      return [{
        pgn: 130313,
        "Instance": 100,
        "Source": "Outside",
        "Actual Humidity": humidity,
      }]
    },
    tests: [{
      input: [ .50 ],
      expected: [{
        "prio": 2,
        "pgn": 130313,
        "dst": 255,
        "fields": {
          "Instance": 100,
          "Source": "Outside",
          "Actual Humidity": .50
        }
      }]
    }]
  }, {
    pgn: 130313,
    title: 'Inside Humidity (PGN130313)',
    optionKey: 'HUMIDITY_INSIDE',
    keys: [
      "environment.inside.relativeHumidity"
    ],
    callback: (humidity) => {
      return [{
        pgn: 130313,
        "Instance": 100,
        "Source": "Inside",
        "Actual Humidity": humidity,
      }]
    },
    tests: [{
      input: [ 1.0 ],
      expected: [{
        "prio": 2,
        "pgn": 130313,
        "dst": 255,
        "fields": {
          "Instance": 100,
          "Source": "Inside",
          "Actual Humidity": 1.0
        }
      }]
    }]
  }]
}
        
