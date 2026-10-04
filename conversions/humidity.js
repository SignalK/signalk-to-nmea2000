
module.exports = (app, plugin) => {
  return [{
    pgn: 130313,
    title: 'Outside Humidity (PGN130313)',
    optionKey: 'HUMIDITY_OUTSIDE',
    // environment.outside.humidity is the Signal K schema path, and the one
    // n2k-signalk uses; relativeHumidity is kept for sources that send it
    keys: [
      "environment.outside.humidity",
      "environment.outside.relativeHumidity"
    ],
    callback: (humidity, relativeHumidity) => {
      return [{
        pgn: 130313,
        "Instance": 100,
        "Source": "Outside",
        "Actual Humidity": humidity ?? relativeHumidity,
      }]
    },
    tests: [{
      input: [ .50, undefined ],
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
    }, {
      input: [ null, .60 ],
      expected: [{
        "prio": 2,
        "pgn": 130313,
        "dst": 255,
        "fields": {
          "Instance": 100,
          "Source": "Outside",
          "Actual Humidity": .60
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
        
