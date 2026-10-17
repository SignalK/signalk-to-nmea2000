const DEFAULT_SET_PRESSURE_PATH = 'environment.outside.pressureSetpoint'

function pressureMessage(pgn, pressure, instance, source) {
  return {
    pgn,
    prio: 2,
    dst: 255,
    fields: {
      "Instance": instance,
      "Source": source,
      "Pressure": pressure
    }
  }
}

function getOption(options, optionKey, field, defaultValue) {
  const conversionOptions = options[optionKey] || {}
  return conversionOptions[field] !== undefined ? conversionOptions[field] : defaultValue
}

function makePressure(info) {
  return {
    pgn: info.pgn,
    title: info.title,
    optionKey: info.optionKey,
    keys: [ info.path ],
    properties: {
      instance: {
        title: 'N2K Pressure Instance',
        type: 'number',
        default: info.instance
      },
      source: {
        title: 'N2K Pressure Source',
        type: 'string',
        default: info.source
      },
      path: {
        title: 'Signal K Pressure Path',
        type: 'string',
        default: info.path
      }
    },
    testOptions: [
      {
        [info.optionKey]: {
          instance: 0,
          source: info.source,
          path: info.path
        }
      },
      {
        [info.optionKey]: {}
      }
    ],
    conversions: (options) => {
      const instance = getOption(options, info.optionKey, 'instance', info.instance)
      const source = getOption(options, info.optionKey, 'source', info.source)
      const skPath = getOption(options, info.optionKey, 'path', info.path)

      return [{
        keys: [ skPath ],
        callback: (pressure) => {
          return [ pressureMessage(info.pgn, pressure, instance, source) ]
        },
        tests: [{
          input: [ info.testPressure ],
          expected: [
            (testOptions) => {
              const expectedInstance = getOption(testOptions, info.optionKey, 'instance', info.instance)
              const expectedSource = getOption(testOptions, info.optionKey, 'source', info.source)
              return pressureMessage(info.pgn, info.testPressure, expectedInstance, expectedSource)
            }
          ]
        }]
      }]
    }
  }
}

module.exports = (app, plugin) => {
  return [
    makePressure({
      pgn: 130314,
      title: 'Actual Pressure (130314)',
      optionKey: 'PRESSURE_ATMOSPHERIC',
      path: 'environment.outside.pressure',
      instance: 100,
      source: 'Atmospheric',
      testPressure: 103047.8
    }),
    makePressure({
      pgn: 130315,
      title: 'Set Pressure (130315)',
      optionKey: 'PRESSURE_SET',
      path: DEFAULT_SET_PRESSURE_PATH,
      instance: 100,
      source: 'Atmospheric',
      testPressure: 101325
    })
  ]
}
