import _ from 'lodash'
import { PGN_127505, TankType } from '@canboat/ts-pgns'
import { Type } from 'typebox'
import { App, Plugin, Conversion } from '../types'
import { type PluginOptions, settingsOf } from '../schema'
import { mappedInstance } from '../pgn'

// The tank paths offered are those in the Signal K data; the saved settings
// are checked without them, as a tank need not have reported yet
const tankProperties = (tankPaths?: string[]) => ({
  tanks: Type.Optional(
    Type.Array(
      Type.Object({
        signalkPath: Type.Optional(
          Type.String({
            title: 'Tank Path',
            ...(tankPaths && { enum: tankPaths })
          })
        ),
        instanceId: Type.Optional(
          Type.Number({ title: 'NMEA2000 Tanks Instance Id' })
        )
      }),
      { title: 'Tank Mapping' }
    )
  )
})
const TankSettings = Type.Object(tankProperties())

module.exports = (app: App, plugin: Plugin): Conversion => {
  const typeMapping: Record<string, TankType> = {
    fuel: TankType.Fuel,
    blackWater: TankType.BlackWater,
    freshWater: TankType.Water,
    wasteWater: TankType.GrayWater,
    greyWater: TankType.GrayWater,
    grayWater: TankType.GrayWater,
    liveWell: TankType.LiveWell,
    lubrication: TankType.Oil,
    gas: TankType.Fuel
  }

  return {
    title: 'Tank Levels (127505)',
    optionKey: 'TANKS',
    context: 'vessels.self',
    properties: ({ liveData }) => {
      if (!liveData) {
        return tankProperties()
      }
      var tanks = _.get(app.signalk.self, 'tanks')
      var tankPaths: string[] = []
      if (!_.isUndefined(tanks)) {
        _.keys(tanks).forEach((type: string) => {
          _.keys(tanks[type]).forEach((instance: string) => {
            tankPaths.push(`tanks.${type}.${instance}`)
          })
        })
      }

      return tankPaths.length == 0 ? undefined : tankProperties(tankPaths)
    },

    testOptions: {
      TANKS: {
        tanks: [
          {
            signalkPath: 'tanks.fuel.0',
            instanceId: 1
          }
        ]
      }
    },

    conversions: (options: PluginOptions) => {
      const settings = settingsOf(options, 'TANKS', TankSettings)
      if (!settings?.tanks) {
        return null
      }
      return settings.tanks.map((tank) => {
        if (!tank.signalkPath) {
          return undefined
        }
        var split = tank.signalkPath.split('.')
        var type = typeMapping[split[1]]
        if (!_.isUndefined(type)) {
          return {
            keys: [
              `${tank.signalkPath}.currentLevel`,
              `${tank.signalkPath}.capacity`
            ],
            timeouts: [60000, 60000],
            callback: (
              currentLevel: number | null,
              capacity: number | null
            ): PGN_127505[] => {
              var res: PGN_127505[] = []
              if (currentLevel != null || capacity != null) {
                res.push(
                  new PGN_127505({
                    instance: mappedInstance(tank.instanceId),
                    type: type,
                    // canboatjs 4 takes the level as a ratio and the capacity
                    // in m3, as Signal K gives them.
                    level: currentLevel == null ? undefined : currentLevel,
                    capacity: capacity == null ? undefined : capacity
                  })
                )
              }

              return res
            },
            tests: [
              {
                input: [0.35, 0.012],
                expected: [
                  {
                    prio: 6,
                    pgn: 127505,
                    dst: 255,
                    fields: {
                      Instance: 1,
                      Type: 'Fuel',
                      Level: 0.35,
                      Capacity: 0.012
                    }
                  }
                ]
              }
            ]
          }
        } else {
          const msg = `unknown tank type: ${split[1]}`
          app.error(msg)
          app.setPluginError?.(msg)
        }
      })
    }
  }
}
