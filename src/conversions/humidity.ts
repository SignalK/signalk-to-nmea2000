import { ServerAPI, Plugin} from '@signalk/server-api'
import { PGN_130313, HumiditySource } from '@canboat/ts-pgns'

module.exports = (app:ServerAPI, plugin:Plugin) => {
  return [{
    pgn: 130313,
    title: 'Outside Humidity (PGN130313)',
    optionKey: 'HUMIDITY_OUTSIDE',
    keys: [
      "environment.outside.relativeHumidity"
    ],
    callback: (humidity:number): PGN_130313[] => {
      return [
        new PGN_130313({
          instance: 100,
          source: HumiditySource.Outside,
          actualHumidity: humidity,
        })
      ]
    },
    tests: [{
      input: [ .50 ],
      expected: [{
        "prio": 5,
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
    callback: (humidity:number): PGN_130313[] => {
      return [
        new PGN_130313({
          instance: 100,
          source: HumiditySource.Inside,
          actualHumidity: humidity,
        })
      ]
    },
    tests: [{
      input: [ 1.0 ],
      expected: [{
        "prio": 5,
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
        
