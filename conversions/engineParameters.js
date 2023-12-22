const _ = require('lodash')

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
                "Oil pressure": oilPres === null ? undefined : oilPres / 100,
                "Oil temperature": oilTemp === null ? undefined : oilTemp,
                "Temperature": temp === null ? undefined : temp,
                "Alternator Potential": altVolt === null ? undefined : altVolt,
                "Fuel Rate": fuelRate ===null ? undefined : fuelRate * 3600 * 1000,
                "Total Engine hours": runTime === null ? undefined : runTime,
                "Coolant Pressure": coolPres === null ? undefined : coolPres / 100,
                "Fuel Pressure": fuelPres === null ? undefined : fuelPres / 100,
                "Discrete Status 1": [],
                "Discrete Status 2": [],
                "Percent Engine Load": engLoad === null ? undefined : engLoad * 100,
                "Engine Load": engLoad === null ? undefined : engLoad * 100,
                "Percent Engine Torque": engTorque === null ? undefined : engTorque * 100,
                "Engine Torque": engTorque === null ? undefined : engTorque * 100
            }]
          },
          tests: [{
            input: [ 102733, 210, 220, 13.1, 100, 201123, 202133, 11111111, 0.5, 1.0 ],
            expected: [{
              "prio": 2,
              "pgn": 127489,
              "dst": 255,
              "fields": {
                "Instance": "Dual Engine Starboard",
                "Oil pressure": 1000,
                "Oil temperature": 210,
                "Temperature": 220,
                "Alternator Potential": 13.1,
                "Fuel Rate": -2355.2,
                "Total Engine hours": "55:52:03",
                "Coolant Pressure": 2000,
                "Fuel Pressure": 111000,
                "Discrete Status 1": [],
                "Discrete Status 2": [],
                "Engine Load": 50,
                "Engine Torque": 100
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
                "Speed": revolutions === null ? undefined : revolutions * 60,
                "Boost Pressure": boostPressure === null ? undefined : boostPressure / 100,
                "Tilt/Trim": trimState === null ? undefined : trimState * 100
            }]
          },
          tests: [{
            input: [ 1001, 20345, 0.5 ],
            expected: [{
              "prio": 2,
              "pgn": 127488,
              "dst": 255,
              "fields": {
                "Instance": "Dual Engine Starboard",
                "Speed": 10908,
                "Boost Pressure": 200,
                "Tilt/Trim": 50
              }
            }]
          }]
        }
      })

      return dyn.concat(rapid)
    }
  }]
}
