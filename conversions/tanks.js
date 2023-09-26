const _ = require('lodash')

module.exports = (app, plugin) => {

  const typeMapping = {
    'fuel': 'Fuel',
    'blackWater': 'Black water',
    'freshWater': 'Water',
    'wasteWater': 'Gray water',
    'greyWater': 'Gray water',
    'grayWater': 'Gray water',
    'liveWell': 'Live well',
    'lubrication': 'Oil',
    'gas': 'Fuel'
  }
  
  return {
    title: 'Tank Levels (127505)',
    optionKey: 'TANKS',
    context: 'vessels.self',
    properties: () => {
      var tanks = _.get(app.signalk.self, 'tanks')
      var tankPaths = []
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

    conversions: (options) => {
      if ( !_.get(options, 'TANKS.tanks') ) {
        return null
      }
      return options.TANKS.tanks.map(tank => {
        var split = tank.signalkPath.split('.')
        var type = typeMapping[split[1]]
        if ( !_.isUndefined(type) ) {
          return {
            keys: [`${tank.signalkPath}.currentLevel`, `${tank.signalkPath}.capacity`],
            timeouts: [60000, 60000],
            callback: (currentLevel, capacity) => {
              var res = []
              if ( currentLevel != null || capacity != null ) {
                
                res.push({
                  pgn: 127505,
                  "Instance": tank.instanceId,
                  Type: type,
                  Level: currentLevel * 100,
                  Capacity: capacity
                })
              }
              
              return res
            },
            tests: [{
              input: [ 0.35, 12 ],
              expected: [{
                "prio": 2,
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


