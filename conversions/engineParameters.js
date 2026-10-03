const _ = require('lodash')

const orUndefined = value => (value === null ? undefined : value)
const DEFAULT_TIMEOUT = 10000  // ms

module.exports = (app, plugin) => {

  // discrete status fields are not yet implemented
  const engParKeys = [
      'oilPressure',
      'oilTemperature',
      'temperature',
      'alternatorVoltage',
      'fuel.rate',
      'runTime',
      'coolantPressure',
      'fuel.pressure',
      'engineLoad',
      'engineTorque'
  ]

  const engRapidKeys = [
    'revolutions',
    'boostPressure',
    'drive.trimState'
  ]

  return [{
    title: 'Temperature, exhaust (130312)',
    optionKey: 'EXHAUST_TEMPERATURE',
    context: 'vessels.self',
    properties: {
      engines: {
        title: 'Engine Mapping',
        type: 'array',
        items: {
          type: 'object',
          properties: {
            signalkId: {
              title: 'Signal K engine id',
              type: 'string'
            },
            tempInstanceId: {
              title: 'NMEA2000 Temperature Instance Id',
              type: 'number'
            }
          }
        }
      }
    },

    testOptions: {
      EXHAUST_TEMPERATURE: {
        engines: [{
          signalkId: 10,
          tempInstanceId: 1
        }]
      }
    },

    conversions: (options) => {
      if ( !_.get(options, 'EXHAUST_TEMPERATURE.engines') ) {
        return null
      }
      return options.EXHAUST_TEMPERATURE.engines.map(engine => {
        return {
          keys: [
            `propulsion.${engine.signalkId}.exhaustTemperature`
          ],
          callback: (temperature) => {
            return [{
              pgn: 130312,
              SID: 0xff,
              "Temperature Instance": engine.tempInstanceId,
              "Instance": engine.tempInstanceId,
              "Source": 14,
              "Actual Temperature": temperature,
            }]
          },
          tests: [{
            input: [ 281.2 ],
            expected: [{
              "prio": 2,
              "pgn": 130312,
              "dst": 255,
              "fields": {
                "Instance": 1,
                "Actual Temperature": 281.2,
                "Source": "Exhaust Gas Temperature",
              }
            }]
          }]
        }
      })
    }
  },
  {
    title: 'Engine Parameters (127489,127488)',
    optionKey: 'ENGINE_PARAMETERS',
    context: 'vessels.self',
    properties: {
      engines: {
        title: 'Engine Mapping',
        type: 'array',
        items: {
          type: 'object',
          properties: {
            signalkId: {
              title: 'Signal K engine id',
              type: 'string'
            },
            instanceId: {
              title: 'NMEA2000 Engine Instance Id',
              type: 'number'
            }
          }
        }
      }
    },

    testOptions: {
      ENGINE_PARAMETERS: {
        engines: [{
          signalkId: 0,
          instanceId: 1
        }]
      }
    },
    
    conversions: (options) => {
      if ( !_.get(options, 'ENGINE_PARAMETERS.engines') ) {
        return null
      }
      const dyn = options.ENGINE_PARAMETERS.engines.map(engine => {
        return {
          keys: engParKeys.map(key => `propulsion.${engine.signalkId}.${key}`),
          timeouts: engParKeys.map(key => DEFAULT_TIMEOUT),
          callback: (oilPres, oilTemp, temp, altVolt, fuelRate, runTime, coolPres, fuelPres, engLoad, engTorque) => {
            return [{
                pgn: 127489,
                "Engine Instance": engine.instanceId,
                "Instance": engine.instanceId,
                // canboatjs 4 takes every value in SI, as Signal K gives it.
                "Oil pressure": orUndefined(oilPres),
                "Oil temperature": orUndefined(oilTemp),
                "Temperature": orUndefined(temp),
                "Alternator Potential": orUndefined(altVolt),
                "Fuel Rate": orUndefined(fuelRate),
                "Total Engine hours": orUndefined(runTime),
                "Coolant Pressure": orUndefined(coolPres),
                "Fuel Pressure": orUndefined(fuelPres),
                "Discrete Status 1": [],
                "Discrete Status 2": [],
                "Percent Engine Load": orUndefined(engLoad),
                "Engine Load": orUndefined(engLoad),
                "Percent Engine Torque": orUndefined(engTorque),
                "Engine Torque": orUndefined(engTorque)
            }]
          },
          tests: [{
            // 102700 Pa, 363.15 K, 353.15 K, 13.1 V, 100 L/h (in m3/s),
            // 201123 s, 120000 Pa, 350000 Pa, 50 % and 100 %.
            input: [ 102700, 363.15, 353.15, 13.1, 0.0000277778, 201123, 120000, 350000, 0.5, 1.0 ],
            expected: [{
              "prio": 2,
              "pgn": 127489,
              "dst": 255,
              "fields": {
                "Instance": "Dual Engine Starboard",
                "Oil pressure": 102700,
                "Oil temperature": 363.1,
                "Temperature": 353.15,
                "Alternator Potential": 13.1,
                "Fuel Rate": 0.0000277778,
                "Total Engine hours": 201123,
                "Coolant Pressure": 120000,
                "Fuel Pressure": 350000,
                "Discrete Status 1": [],
                "Discrete Status 2": [],
                "Engine Load": 0.5,
                "Engine Torque": 1
              }
            }]
          }]
        }
      })

      const rapid = options.ENGINE_PARAMETERS.engines.map(engine => {
        return {
          keys: engRapidKeys.map(key => `propulsion.${engine.signalkId}.${key}`),
          timeouts: engRapidKeys.map(key => DEFAULT_TIMEOUT),
          callback: (revolutions, boostPressure, trimState) => {
            return [{
                pgn: 127488,
                "Engine Instance": engine.instanceId,
                "Instance": engine.instanceId,
                // canboatjs 4 takes Hz, Pa and a ratio, as Signal K gives them.
                "Speed": orUndefined(revolutions),
                "Boost Pressure": orUndefined(boostPressure),
                "Tilt/Trim": orUndefined(trimState)
            }]
          },
          tests: [{
            // 1800 rpm (30 Hz), 120000 Pa, 50 %.
            input: [ 30, 120000, 0.5 ],
            expected: [{
              "prio": 2,
              "pgn": 127488,
              "dst": 255,
              "fields": {
                "Instance": "Dual Engine Starboard",
                "Speed": 30,
                "Boost Pressure": 120000,
                "Tilt/Trim": 0.5
              }
            }]
          }]
        }
      })

      return dyn.concat(rapid)
    }
  }]
}
