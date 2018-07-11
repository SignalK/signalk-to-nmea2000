const debug = require("debug")("signalk:signalk-to-nmea2000");
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
              "Temperature Source": 14,
              "Actual Temperature": temperature,
            }]
          }
        }
      })
    }
  },
  {
    //pgn: 127489,
    title: 'Engine Parameters, Dynamic (127489)',
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

    conversions: (options) => {
      if ( !_.get(options, 'ENGINE_PARAMETERS.engines') ) {
        return null
      }
      return options.ENGINE_PARAMETERS.engines.map(engine => {
        return {
          keys: engParKeys.map(key => `propulsion.${engine.signalkId}.${key}`),
          timeouts: engParKeys.map(key => DEFAULT_TIMEOUT),
          callback: (oilPres, oilTemp, temp, altVolt, fuelRate, runTime, coolPres, fuelPres, engLoad, engTorque) => {
            return [{
                pgn: 127489,
                "Engine Instance": engine.instanceId,
                "Oil Pressure": _.isUndefined(oilPres) ? undefined : oilPres / 100,
                "Oil Temperature": oilTemp,
                "Temperature": temp,
                "Alternator Potential": altVolt,
                "Fuel Rate": _.isUndefined(fuelRate) ? undefined : fuelRate / 3600 * 1000,
                "Total Engine Hours": _.isUndefined(runTime) ? undefined : runTime / 3600,
                "Coolant Pressure": _.isUndefined(coolPres) ? undefined : coolPres / 100,
                "Fuel Pressure": _.isUndefined(fuelPres) ? undefined : fuelPres / 100,
                "Reserved": 0,
                "Discrete Status 1": undefined,
                "Discrete Status 2": undefined,
                "Percent Engine Load": _.isUndefined(engLoad) ? undefined : engLoad * 100,
                "Percent Engine Torque": _.isUndefined(engTorque) ? undefined : engTorque * 100
            }]
          }
        }
      })
    }
  }]
}
