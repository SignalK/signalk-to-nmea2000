import { ServerAPI, Plugin, Delta, Update, PathValue, hasValues} from '@signalk/server-api'
import { PGN } from '@canboat/ts-pgns'

let tempMessage = (pgn:number, temp:number, inst:number, src:number) => {
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

function makeTemperature(pgn:number, prefix:string, info:any)
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
        default: info.instance
      },
    },
    
    testOptions: [
      {
        [optionKey]: {
          instance: 0
        }
      },
      {
        [optionKey]: {
        }
      }
    ],
      
    conversions: (options:any) => {
      let instance = options[optionKey].instance
      if ( instance === undefined )
        instance = info.instance
      return [{
        keys: [ info.source ],
        callback: (temperature:number) => {
          return [ tempMessage(pgn, temperature, instance, info.n2kSource) ]
        },
        tests: [
          {
            input: [ 281.2 ],
            expected: [
              (testOptions:any) => {
                let expectedInstance = testOptions[optionKey].instance !== undefined ? testOptions[optionKey].instance : info.instance
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
    instance: 101,
    option: 'OUTSIDE'
  },
  {
    n2kSource: "Inside Temperature",
    source: 'environment.inside.temperature',
    instance: 102,
    option: 'INSIDE'
  },
  {
    n2kSource: "Engine Room Temperature",
    source: 'environment.inside.engineRoom.temperature',
    instance: 103,
    option: 'ENGINEROOM'
  },
  {
    n2kSource: "Main Cabin Temperature",
    source: 'environment.inside.mainCabin.temperature',
    instance: 107 ,
    option: 'MAINCABIN'
  },
  {
    n2kSource: "Refrigeration Temperature",
    source: 'environment.inside.refrigerator.temperature',
    instance: 107 ,
    option: 'refridgerator'
  },
  {
    n2kSource: "Heating System Temperature",
    source: 'environment.inside.heating.temperature',
    instance: 107,
    option: 'HEATINGSYSTEM'
  },
  {
    n2kSource: "Dew Point Temperature",
    source: 'environment.outside.dewPointTemperature',
    instance:107 ,
    option: 'DEWPOINT'
  },
  {
    n2kSource: "Apparent Wind Chill Temperature",
    source: 'environment.outside.apparentWindChillTemperature',
    instance: 107,
    option: 'APPARENTWINDCHILL'
  },
  {
    n2kSource: "Theoretical Wind Chill Temperature",
    source: 'environment.outside.theoreticalWindChillTemperature',
    instance: 107 ,
    option: 'THEORETICALWINDCHILL'
  },
  {
    n2kSource: "Heat Index Temperature",
    source: 'environment.outside.heatIndexTemperature',
    instance: 107 ,
    option: 'HEATINDEX'
  },
  {
    n2kSource: "Freezer Temperature",
    source: 'environment.inside.freezer.temperature',
    instance: 107 ,
    option: 'FREEZER'
  }
]

module.exports = (app:ServerAPI, plugin:Plugin) => {
  return temperatures.flatMap(info => {
    return [
      makeTemperature(130312, 'TEMPERATURE', info),
      makeTemperature(130316, 'TEMPERATURE2', info)
    ]
  })
}
