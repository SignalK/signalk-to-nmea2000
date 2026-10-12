const pressureKey = 'environment.outside.pressure'
// environment.outside.humidity is the Signal K schema path;
// relativeHumidity is kept for sources that send it, as in humidity.js
const temperatureHumidityKeys = [
  'environment.outside.temperature',
  'environment.outside.humidity',
  'environment.outside.relativeHumidity'
]

module.exports = (app, plugin) => {
  return {
    pgns: [ 130311 ],
    title: 'Environmental Parameters (130311)',
    optionKey: 'ENVIRONMENT_PARAMETERS',
    keys: [ pressureKey, ...temperatureHumidityKeys ],
    properties: {
      temperatureAndHumidity: {
        title: 'Also send outside temperature and humidity',
        description: 'For displays that read them from 130311 rather than 130312/130313, such as the Raymarine i70s. Nothing is sent while any of these values comes from NMEA 2000.',
        type: 'boolean',
        default: false
      }
    },

    testOptions: [
      { ENVIRONMENT_PARAMETERS: {} },
      { ENVIRONMENT_PARAMETERS: { temperatureAndHumidity: true } }
    ],

    conversions: (options) => {
      if ( !options.ENVIRONMENT_PARAMETERS?.temperatureAndHumidity ) {
        return [{
          keys: [ pressureKey ],
          callback: (pressure) => [{
            pgn: 130311,
            "Atmospheric Pressure": pressure
          }],
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
        }]
      }

      return [{
        keys: [ pressureKey, ...temperatureHumidityKeys ],
        callback: (pressure, temperature, humidity, relativeHumidity) => {
          humidity = humidity ?? relativeHumidity
          return [{
            pgn: 130311,
            "Temperature Source": temperature == null ? undefined : "Outside Temperature",
            "Humidity Source": humidity == null ? undefined : "Outside",
            "Temperature": temperature ?? undefined,
            "Humidity": humidity ?? undefined,
            "Atmospheric Pressure": pressure ?? undefined
          }]
        },
        tests: [{
          input: [ 101300, 291.2, 0.64, null ],
          expected: [{
            "prio": 2,
            "pgn": 130311,
            "dst": 255,
            "fields": {
              "Temperature Source": "Outside Temperature",
              "Humidity Source": "Outside",
              "Temperature": 291.2,
              "Humidity": 0.64,
              "Atmospheric Pressure": 101300
            }
          }]
        }, {
          // relativeHumidity when humidity is not there, and no pressure
          input: [ null, null, null, 0.5 ],
          expected: [{
            "prio": 2,
            "pgn": 130311,
            "dst": 255,
            "fields": {
              "Humidity Source": "Outside",
              "Humidity": 0.5
            }
          }]
        }]
      }]
    }
  }
}
