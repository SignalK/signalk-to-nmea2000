import { PGN_130314, PressureSource } from '@canboat/ts-pgns'
import { Type } from 'typebox'
import { App, Plugin, Conversion } from '../types'
import { type PluginOptions, settingsOf } from '../schema'

// Instance 100 when none is configured, so existing setups keep theirs
const defaultInstance = 100

const pressureProperties = {
  instance: Type.Optional(
    Type.Integer({
      title: 'N2K Pressure Instance',
      description: 'Tells apart several pressure sensors',
      minimum: 0,
      maximum: 252,
      default: defaultInstance
    })
  )
}
const PressureSettings = Type.Object(pressureProperties)

module.exports = (app: App, plugin: Plugin): Conversion[] => {
  return [
    {
      pgn: 130314,
      title: 'Atmospheric Pressure (130314)',
      optionKey: 'PRESSURE_ATMOSPHERIC',
      keys: ['environment.outside.pressure'],
      properties: pressureProperties,

      testOptions: [
        { PRESSURE_ATMOSPHERIC: { instance: 0 } },
        { PRESSURE_ATMOSPHERIC: {} }
      ],

      conversions: (options: PluginOptions) => {
        const instance =
          settingsOf(options, 'PRESSURE_ATMOSPHERIC', PressureSettings)
            ?.instance ?? defaultInstance
        return [
          {
            keys: ['environment.outside.pressure'],
            callback: (pressure: number): PGN_130314[] => [
              new PGN_130314({
                instance,
                source: PressureSource.Atmospheric,
                pressure
              })
            ],
            tests: [
              {
                input: [103047.8],
                expected: [
                  (testOptions: any) => ({
                    prio: 5,
                    pgn: 130314,
                    dst: 255,
                    fields: {
                      Instance:
                        testOptions.PRESSURE_ATMOSPHERIC.instance ??
                        defaultInstance,
                      Source: 'Atmospheric',
                      Pressure: 103047.8
                    }
                  })
                ]
              }
            ]
          }
        ]
      }
    }
  ]
}
