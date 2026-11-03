import _ from 'lodash'
import { PGN_127505, TankType } from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'
import { withPriority } from '../pgn'

interface Tank {
  signalkPath: string
  instanceId: number
}

module.exports = (app: App, plugin: Plugin): Conversion => {
  const typeMapping: Record<string, TankType> = {
    'fuel': TankType.Fuel,
    'blackWater': TankType.BlackWater,
    'freshWater': TankType.Water,
    'wasteWater': TankType.GrayWater,
    'greyWater': TankType.GrayWater,
    'grayWater': TankType.GrayWater,
    'liveWell': TankType.LiveWell,
    'lubrication': TankType.Oil,
    'gas': TankType.Fuel
  }
  
  return {
    title: 'Tank Levels (127505)',
    optionKey: 'TANKS',
    context: 'vessels.self',
    properties: () => {
      var tanks = _.get(app.signalk.self, 'tanks')
      var tankPaths: string[] = []
      if ( !_.isUndefined(tanks) ) {
        _.keys(tanks).forEach((type: string) => {
          _.keys(tanks[type]).forEach((instance: string) => {
            tankPaths.push(`tanks.${type}.${instance}`)
          })
        })
      }
      
      return tankPaths.length == 0 ? undefined : {
        tanks: {
          title: 'Tank Mapping',
          type: 'array',
          items: {
            type: 'object',
            properties: {
              signalkPath: {
                title: 'Tank Path',
                type: 'string',
                enum: tankPaths
              },
              instanceId: {
                title: 'NMEA2000 Tanks Instance Id',
                type: 'number'
              }
            }
          }
        }
      }
    },

    testOptions: {
      TANKS:
      {
        tanks: [
          {
            signalkPath: 'tanks.fuel.0',
            instanceId: 1
          }
        ]
      }
    },

    conversions: (options: any) => {
      if ( !_.get(options, 'TANKS.tanks') ) {
        return null as unknown as Conversion[]
      }
      return options.TANKS.tanks.map((tank: Tank) => {
        var split = tank.signalkPath.split('.')
        var type = typeMapping[split[1]]
        if ( !_.isUndefined(type) ) {
          return {
            keys: [`${tank.signalkPath}.currentLevel`, `${tank.signalkPath}.capacity`],
            timeouts: [60000, 60000],
            callback: (
              currentLevel: number | null,
              capacity: number | null
            ): PGN_127505[] => {
              var res: PGN_127505[] = []
              if ( currentLevel != null || capacity != null ) {
                res.push(withPriority(new PGN_127505({
                  instance: tank.instanceId,
                  type: type,
                  // canboatjs 4 takes the level as a ratio and the capacity
                  // in m3, as Signal K gives them.
                  level: currentLevel == null ? undefined : currentLevel,
                  capacity: capacity == null ? undefined : capacity
                })))
              }
              
              return res
            },
            tests: [{
              input: [ 0.35, .012 ],
              expected: [{
                "prio": 2,
                "pgn": 127505,
                "dst": 255,
                "fields": {
                  "Instance": 1,
                  "Type": "Fuel",
                  "Level": 0.35,
                  "Capacity": 0.012
                }
              }]
            }]
          }
        }
        else
        {
          const msg = `unknown tank type: ${split[1]}`
          app.error(msg)
          // Called with the message alone, as it always was; the server's
          // setProviderError takes a provider id first.
          ;(app.setProviderError as unknown as (msg: string) => void)(msg)
        }
      })
    }
  }
}


