
let tempMessage = (pgn, temp, inst, src) => {
  return {
    pgn,
    prio: 2,
    dst: 255,
    fields: {
      "Instance": inst,
      "Source": src,
      [pgn == 130316 ? "Temperature" : "Actual Temperature"]: temp
    }
  }
}

// The data instance tells apart several sensors of the same kind on one
// device; the Source field already says which kind this is
const defaultInstance = 0

function makeTemperature(pgn, prefix, info)
{
  let optionKey = `${prefix}_${info.option}`
  return {
    pgn,
    title: `${info.n2kSource} (${pgn})`,
    optionKey,
    keys: [ info.source ],
    properties: {
      instance: {
        title: 'N2K Temperature Instance',
        type: 'number',
        default: defaultInstance
      },
    },
    
    testOptions: [
      {
        [optionKey]: {
          instance: 5
        }
      },
      {
        [optionKey]: {
        }
      }
    ],
      
    conversions: (options) => {
      let instance = options[optionKey].instance
      if ( instance === undefined )
        instance = defaultInstance
      return [{
        keys: [ info.source ],
        callback: (temperature) => {
          return [ tempMessage(pgn, temperature, instance, info.n2kSource) ]
        },
        tests: [
          {
            input: [ 281.2 ],
            expected: [
              (testOptions) => {
                let expectedInstance = testOptions[optionKey].instance !== undefined ? testOptions[optionKey].instance : defaultInstance
                return tempMessage(pgn, 281.2, expectedInstance, info.n2kSource)
              }
            ]
          }
        ]
      }]
    }
  }
}


const temperatures = [
  {
    n2kSource: "Outside Temperature",
    source: 'environment.outside.temperature',
    option: 'OUTSIDE'
  },
  {
    n2kSource: "Inside Temperature",
    source: 'environment.inside.temperature',
    option: 'INSIDE'
  },
  {
    n2kSource: "Engine Room Temperature",
    source: 'environment.inside.engineRoom.temperature',
    option: 'ENGINEROOM'
  },
  {
    n2kSource: "Main Cabin Temperature",
    source: 'environment.inside.mainCabin.temperature',
    option: 'MAINCABIN'
  },
  {
    n2kSource: "Refrigeration Temperature",
    source: 'environment.inside.refrigerator.temperature',
    option: 'refridgerator'
  },
  {
    n2kSource: "Heating System Temperature",
    source: 'environment.inside.heating.temperature',
    option: 'HEATINGSYSTEM'
  },
  {
    n2kSource: "Dew Point Temperature",
    source: 'environment.outside.dewPointTemperature',
    option: 'DEWPOINT'
  },
  {
    n2kSource: "Apparent Wind Chill Temperature",
    source: 'environment.outside.apparentWindChillTemperature',
    option: 'APPARENTWINDCHILL'
  },
  {
    n2kSource: "Theoretical Wind Chill Temperature",
    source: 'environment.outside.theoreticalWindChillTemperature',
    option: 'THEORETICALWINDCHILL'
  },
  {
    n2kSource: "Heat Index Temperature",
    source: 'environment.outside.heatIndexTemperature',
    option: 'HEATINDEX'
  },
  {
    n2kSource: "Freezer Temperature",
    source: 'environment.inside.freezer.temperature',
    option: 'FREEZER'
  }
]

module.exports = (app, plugin) => {
  return temperatures.flatMap(info => {
    return [
      makeTemperature(130312, 'TEMPERATURE', info),
      makeTemperature(130316, 'TEMPERATURE2', info)
    ]
  })
}
