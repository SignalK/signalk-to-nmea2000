const _ = require('lodash')

const orUndefined = value => (value === null ? undefined : value)
const DEFAULT_TIMEOUT = 10000  // ms

const engineStatus1 = [
  ['checkEngine', 'Check Engine'],
  ['overTemperature', 'Over Temperature'],
  ['lowOilPressure', 'Low Oil Pressure'],
  ['lowOilLevel', 'Low Oil Level'],
  ['lowFuelPressure', 'Low Fuel Pressure'],
  ['lowSystemVoltage', 'Low System Voltage'],
  ['lowCoolantLevel', 'Low Coolant Level'],
  ['waterFlow', 'Water Flow'],
  ['waterInFuel', 'Water In Fuel'],
  ['chargeIndicator', 'Charge Indicator'],
  ['preheatIndicator', 'Preheat Indicator'],
  ['highBoostPressure', 'High Boost Pressure'],
  ['revLimitExceeded', 'Rev Limit Exceeded'],
  ['egrSystem', 'EGR System'],
  ['throttlePositionSensor', 'Throttle Position Sensor'],
  ['emergencyStop', 'Emergency Stop']
]

const engineStatus2 = [
  ['warningLevel1', 'Warning Level 1'],
  ['warningLevel2', 'Warning Level 2'],
  ['powerReduction', 'Power Reduction'],
  ['maintenanceNeeded', 'Maintenance Needed'],
  ['engineCommError', 'Engine Comm Error'],
  ['subOrSecondaryThrottle', 'Sub or Secondary Throttle'],
  ['neutralStartProtect', 'Neutral Start Protect'],
  ['engineShuttingDown', 'Engine Shutting Down']
]

const activeEngineStatuses = (statuses, values) => statuses.flatMap(([, name], index) =>
  values[index] && values[index].state && values[index].state !== 'normal' ? [name] : []
)

module.exports = (app, plugin) => {

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

  return [
    exhaustTemperature(130312, 'EXHAUST_TEMPERATURE'),
    exhaustTemperature(130316, 'EXHAUST_TEMPERATURE2'),
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
        const statusKeys = [...engineStatus1, ...engineStatus2]
          .map(([key]) => `notifications.propulsion.${engine.signalkId}.${key}`)
        const keys = engParKeys
          .map(key => `propulsion.${engine.signalkId}.${key}`)
          .concat(statusKeys)
        return {
          keys,
          timeouts: keys.map(() => DEFAULT_TIMEOUT),
          callback: (oilPres, oilTemp, temp, altVolt, fuelRate, runTime, coolPres, fuelPres, engLoad, engTorque, ...statusValues) => {
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
                "Discrete Status 1": activeEngineStatuses(engineStatus1, statusValues),
                "Discrete Status 2": activeEngineStatuses(engineStatus2, statusValues.slice(engineStatus1.length)),
                "Engine Load": orUndefined(engLoad),
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
          }, {
            // CANboat's ENGINE_STATUS_1/2 bit lookups are represented as active names.
            input: [
              102700, 363.15, 353.15, 13.1, 0.0000277778, 201123, 120000, 350000, 0.5, 1.0,
              ...engineStatus1.map(([key]) => key === 'lowOilPressure' ? { state: 'alarm' } : null),
              ...engineStatus2.map(([key]) => key === 'maintenanceNeeded' ? { state: 'warn' } : null)
            ],
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
                "Discrete Status 1": ["Low Oil Pressure"],
                "Discrete Status 2": ["Maintenance Needed"],
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

// Exhaust gas temperature per engine. 130316 is the extended range version of
// 130312, which some displays (e.g. Raymarine Axiom) read instead.
function exhaustTemperature(pgn, optionKey) {
  const temperatureField = pgn == 130316 ? 'Temperature' : 'Actual Temperature'
  // 130312 goes up to 655.32 K, so test 130316 above that
  const testTemperature = pgn == 130316 ? 700 : 281.2
  return {
    title: `Temperature, exhaust (${pgn})`,
    optionKey,
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
      [optionKey]: {
        engines: [{
          signalkId: 10,
          tempInstanceId: 1
        }]
      }
    },

    conversions: (options) => {
      if ( !_.get(options, [optionKey, 'engines']) ) {
        return null
      }
      return options[optionKey].engines.map(engine => {
        return {
          keys: [
            `propulsion.${engine.signalkId}.exhaustTemperature`
          ],
          callback: (temperature) => {
            return [{
              pgn,
              SID: 0xff,
              "Instance": engine.tempInstanceId,
              "Source": "Exhaust Gas Temperature",
              [temperatureField]: temperature,
            }]
          },
          tests: [{
            input: [ testTemperature ],
            expected: [{
              "prio": 2,
              "pgn": pgn,
              "dst": 255,
              "fields": {
                "Instance": 1,
                [temperatureField]: testTemperature,
                "Source": "Exhaust Gas Temperature",
              }
            }]
          }]
        }
      })
    }
  }
}
