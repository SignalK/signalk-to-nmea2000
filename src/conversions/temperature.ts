import { ServerAPI, Plugin, Delta, Update, PathValue, hasValues} from '@signalk/server-api'
import { PGN, TemperatureSource } from '@canboat/ts-pgns'

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
    n2kSource: TemperatureSource.SeaTemperature,
    source: 'environment.water.temperature',
    instance: 101,
    option: 'WATER'
  },
  {
    n2kSource: TemperatureSource.OutsideTemperature,
    source: 'environment.outside.temperature',
    instance: 101,
    option: 'OUTSIDE'
  },
  {
    n2kSource: TemperatureSource.InsideTemperature,
    source: 'environment.inside.temperature',
    instance: 102,
    option: 'INSIDE'
  },
  {
    n2kSource: TemperatureSource.EngineRoomTemperature,
    source: 'environment.inside.engineRoom.temperature',
    instance: 103,
    option: 'ENGINEROOM'
  },
  {
    n2kSource: TemperatureSource.MainCabinTemperature,
    source: 'environment.inside.mainCabin.temperature',
    instance: 107 ,
    option: 'MAINCABIN'
  },
  {
    n2kSource: TemperatureSource.LiveWellTemperature,
    source: 'environment.liveWell.temperature',
    instance: 107 ,
    option: 'LIVEWELL'
  },
  {
    n2kSource: TemperatureSource.BaitWellTemperature,
    source: 'environment.baitWell.temperature',
    instance: 107 ,
    option: 'BAITWELL'
  },
  {
    n2kSource: TemperatureSource.RefrigerationTemperature,
    source: 'environment.inside.refrigerator.temperature',
    instance: 107 ,
    option: 'refridgerator'
  },
  {
    n2kSource: TemperatureSource.HeatingSystemTemperature,
    source: 'environment.inside.heating.temperature',
    instance: 107,
    option: 'HEATINGSYSTEM'
  },
  {
    n2kSource: TemperatureSource.DewPointTemperature,
    source: 'environment.outside.dewPointTemperature',
    instance:107 ,
    option: 'DEWPOINT'
  },
  {
    n2kSource: TemperatureSource.ApparentWindChillTemperature,
    source: 'environment.outside.apparentWindChillTemperature',
    instance: 107,
    option: 'APPARENTWINDCHILL'
  },
  {
    n2kSource: TemperatureSource.TheoreticalWindChillTemperature,
    source: 'environment.outside.theoreticalWindChillTemperature',
    instance: 107 ,
    option: 'THEORETICALWINDCHILL'
  },
  {
    n2kSource: TemperatureSource.HeatIndexTemperature,
    source: 'environment.outside.heatIndexTemperature',
    instance: 107 ,
    option: 'HEATINDEX'
  },
  {
    n2kSource: TemperatureSource.FreezerTemperature,
    source: 'environment.inside.freezer.temperature',
    instance: 107 ,
    option: 'FREEZER'
  },
  {
    n2kSource: TemperatureSource.ExhaustGasTemperature,
    source: 'environment.exhaustGas.temperature',
    instance: 107 ,
    option: 'EXHAUSTGAS'
  },
  {
    n2kSource: TemperatureSource.ShaftSealTemperature,
    source: 'environment.shaftSeal.temperature',
    instance: 107 ,
    option: 'SHAFTSEAL'
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
