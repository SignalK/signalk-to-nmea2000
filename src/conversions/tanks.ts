import { ServerAPI, Plugin} from '@signalk/server-api'
import {
  PGN_127505,
  TankType
} from '@canboat/ts-pgns'
import _ from 'lodash'

module.exports = (app:any, plugin:Plugin) => {
  const typeMapping: {[key:string]: TankType} = {
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
        _.keys(tanks).forEach(type => {
          _.keys(tanks[type]).forEach(instance => {
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

    conversions: (options:any) => {
      if ( !_.get(options, 'TANKS.tanks') ) {
        return null
      }
      return options.TANKS.tanks.map((tank:any) => {
        var split = tank.signalkPath.split('.')
        var type = typeMapping[split[1]]
        if ( !_.isUndefined(type) ) {
          return {
            keys: [`${tank.signalkPath}.currentLevel`, `${tank.signalkPath}.capacity`],
            timeouts: [60000, 60000],
            callback: (currentLevel:number, capacity:number): PGN_127505[]|undefined => {
              var res = []
              if ( currentLevel != null || capacity != null ) {
                return [
                  new PGN_127505({
                    instance: tank.instanceId,
                    type: type,
                    level: currentLevel * 100,
                    capacity: capacity * 1000
                  })
                ]
              }
            },
            tests: [{
              input: [ 0.35, .012 ],
              expected: [{
                "prio": 6,
                "pgn": 127505,
                "dst": 255,
                "fields": {
                  "Instance": 1,
                  "Type": "Fuel",
                  "Level": 35,
                  "Capacity": 12
                }
              }]
            }]
          }
        }
        else
        {
          const msg = `unknown tank type: ${split[1]}`
          app.error(msg)
          app.setProviderError(msg)
        }
      })
    }
  }
}


