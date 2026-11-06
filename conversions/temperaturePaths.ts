import _ from 'lodash'
import { PGN_130316, TemperatureSource } from '@canboat/ts-pgns'
import { Type } from 'typebox'
import { App, Plugin, Conversion } from '../types'
import { type PluginOptions, settingsOf } from '../schema'

// Any number of temperatures, each from its own Signal K path, as 130316 with
// the source and instance chosen for it. Some displays read one PGN only, so
// several sensors of one kind (three cabins, two fridges) are told apart by
// their instance.

const sources = Object.values(TemperatureSource) as string[]

const temperatureProperties = (paths: string[]) => ({
  temperatures: Type.Optional(
    Type.Array(
      Type.Object({
        path: Type.Optional(
          Type.String({
            title: 'Signal K path',
            description:
              'Pick a temperature present in the Signal K data or enter one',
            examples: paths
          })
        ),
        source: Type.Optional(
          Type.String({
            title: 'N2K Temperature Source',
            enum: sources,
            default: TemperatureSource.InsideTemperature
          })
        ),
        instance: Type.Optional(
          Type.Integer({
            title: 'N2K Temperature Instance',
            minimum: 0,
            maximum: 252,
            default: 0
          })
        )
      }),
      { title: 'Temperatures' }
    )
  )
})
const TemperatureSettings = Type.Object(temperatureProperties([]))

// The paths in the vessel's data that end in temperature
function temperaturePaths(tree: unknown, prefix = ''): string[] {
  if (!_.isPlainObject(tree)) return []
  return Object.entries(tree as Record<string, unknown>).flatMap(
    ([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key
      if (key === 'meta' || key === 'values') return []
      if (_.isPlainObject(value) && 'value' in (value as object))
        return /temperature$/i.test(key) ? [path] : []
      return temperaturePaths(value, path)
    }
  )
}

module.exports = (app: App, plugin: Plugin): Conversion => ({
  pgn: 130316,
  title: 'Temperatures from any path (130316)',
  optionKey: 'TEMPERATURE_PATHS',
  context: 'vessels.self',
  properties: () =>
    temperatureProperties(
      _.uniq(
        ['environment', 'propulsion', 'electrical'].flatMap((root) =>
          temperaturePaths(
            typeof app.getSelfPath === 'function'
              ? app.getSelfPath(root)
              : undefined,
            root
          )
        )
      ).sort()
    ),

  testOptions: {
    TEMPERATURE_PATHS: {
      temperatures: [
        {
          path: 'environment.inside.forwardCabin.temperature',
          source: TemperatureSource.InsideTemperature,
          instance: 1
        },
        { path: 'environment.inside.aftCabin.temperature' },
        {
          path: 'environment.outside.temperature',
          source: TemperatureSource.OutsideTemperature,
          instance: 2
        }
      ]
    }
  },

  conversions: (options: PluginOptions) => {
    const settings = settingsOf(
      options,
      'TEMPERATURE_PATHS',
      TemperatureSettings
    )
    return (settings?.temperatures || [])
      .filter(({ path }) => path)
      .map(({ path, source, instance }, index) => ({
        keys: [path!],
        callback: (temperature: number) => [
          new PGN_130316({
            instance: instance ?? 0,
            source:
              (source as TemperatureSource) ??
              TemperatureSource.InsideTemperature,
            temperature
          })
        ],
        tests: [
          {
            input: [294.15 + index],
            expected: [
              {
                prio: 5,
                pgn: 130316,
                dst: 255,
                fields: {
                  Instance: [1, 0, 2][index],
                  Source: [
                    'Inside Temperature',
                    'Inside Temperature',
                    'Outside Temperature'
                  ][index],
                  Temperature: 294.15 + index
                }
              }
            ]
          }
        ]
      }))
  }
})
