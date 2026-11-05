import { PGN_130312, PGN_130316, TemperatureSource } from '@canboat/ts-pgns'
import { Type } from 'typebox'
import { App, Plugin, Conversion } from '../types'
import { type PluginOptions, settingsOf } from '../schema'

interface TemperatureInfo {
  n2kSource: TemperatureSource
  source: string
  option: string
}

// The message the tests expect, in canboat's display names.
let tempMessage = (pgn: number, temp: number, inst: number, src: string) => {
  return {
    pgn,
    // canboat's default for both 130312 and 130316
    prio: 5,
    dst: 255,
    fields: {
      Instance: inst,
      Source: src,
      [pgn == 130316 ? 'Temperature' : 'Actual Temperature']: temp
    }
  }
}

// The message a callback sends.
const temperatureMessage = (
  pgn: number,
  temp: number,
  inst: number,
  src: TemperatureSource
): PGN_130312 | PGN_130316 =>
  pgn == 130316
    ? new PGN_130316({ instance: inst, source: src, temperature: temp })
    : new PGN_130312({ instance: inst, source: src, actualTemperature: temp })

// The data instance tells apart several sensors of the same kind on one
// device; the Source field already says which kind this is
const defaultInstance = 0

const temperatureProperties = {
  instance: Type.Optional(
    Type.Number({ title: 'N2K Temperature Instance', default: defaultInstance })
  )
}
const TemperatureSettings = Type.Object(temperatureProperties)

function makeTemperature(
  pgn: number,
  prefix: string,
  info: TemperatureInfo
): Conversion {
  let optionKey = `${prefix}_${info.option}`
  return {
    pgn,
    title: `${info.n2kSource} (${pgn})`,
    optionKey,
    keys: [info.source],
    properties: temperatureProperties,

    testOptions: [
      {
        [optionKey]: {
          instance: 5
        }
      },
      {
        [optionKey]: {}
      }
    ],

    conversions: (options: PluginOptions) => {
      const instance =
        settingsOf(options, optionKey, TemperatureSettings)?.instance ??
        defaultInstance
      return [
        {
          keys: [info.source],
          callback: (temperature: number) => {
            return [
              temperatureMessage(pgn, temperature, instance, info.n2kSource)
            ]
          },
          tests: [
            {
              input: [281.2],
              expected: [
                (testOptions: any) => {
                  let expectedInstance =
                    testOptions[optionKey].instance !== undefined
                      ? testOptions[optionKey].instance
                      : defaultInstance
                  return tempMessage(
                    pgn,
                    281.2,
                    expectedInstance,
                    info.n2kSource
                  )
                }
              ]
            }
          ]
        }
      ]
    }
  }
}

const temperatures: TemperatureInfo[] = [
  {
    n2kSource: TemperatureSource.SeaTemperature,
    source: 'environment.water.temperature',
    option: 'SEA'
  },
  {
    n2kSource: TemperatureSource.OutsideTemperature,
    source: 'environment.outside.temperature',
    option: 'OUTSIDE'
  },
  {
    n2kSource: TemperatureSource.InsideTemperature,
    source: 'environment.inside.temperature',
    option: 'INSIDE'
  },
  {
    n2kSource: TemperatureSource.EngineRoomTemperature,
    source: 'environment.inside.engineRoom.temperature',
    option: 'ENGINEROOM'
  },
  {
    n2kSource: TemperatureSource.MainCabinTemperature,
    source: 'environment.inside.mainCabin.temperature',
    option: 'MAINCABIN'
  },
  {
    n2kSource: TemperatureSource.RefrigerationTemperature,
    source: 'environment.inside.refrigerator.temperature',
    option: 'refridgerator'
  },
  {
    n2kSource: TemperatureSource.HeatingSystemTemperature,
    source: 'environment.inside.heating.temperature',
    option: 'HEATINGSYSTEM'
  },
  {
    n2kSource: TemperatureSource.DewPointTemperature,
    source: 'environment.outside.dewPointTemperature',
    option: 'DEWPOINT'
  },
  {
    n2kSource: TemperatureSource.ApparentWindChillTemperature,
    source: 'environment.outside.apparentWindChillTemperature',
    option: 'APPARENTWINDCHILL'
  },
  {
    n2kSource: TemperatureSource.TheoreticalWindChillTemperature,
    source: 'environment.outside.theoreticalWindChillTemperature',
    option: 'THEORETICALWINDCHILL'
  },
  {
    n2kSource: TemperatureSource.HeatIndexTemperature,
    source: 'environment.outside.heatIndexTemperature',
    option: 'HEATINDEX'
  },
  {
    n2kSource: TemperatureSource.FreezerTemperature,
    source: 'environment.inside.freezer.temperature',
    option: 'FREEZER'
  }
]

module.exports = (app: App, plugin: Plugin): Conversion[] => {
  return temperatures.flatMap((info) => {
    return [
      makeTemperature(130312, 'TEMPERATURE', info),
      makeTemperature(130316, 'TEMPERATURE2', info)
    ]
  })
}
