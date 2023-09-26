const _ = require('lodash')

module.exports = (app, plugin) => {

  const batteryKeys = [
    'voltage',
    'current',
    'temperature',
    'capacity.stateOfCharge',
    'capacity.timeRemaining',
    'capacity.stateOfHealth',
    'ripple'
  ]
  
  return {
    title: 'Battery (127506 & 127508)',
    optionKey: 'BATTERYv2',
    context: 'vessels.self',
    properties: {
      batteries: {
        title: 'Battery Mapping',
        type: 'array',
        items: {
          type: 'object',
          properties: {
            signalkId: {
              title: 'Signal K battery id',
              type: 'string'
            },
            instanceId: {
              title: 'NMEA2000 Battery Instance Id',
              type: 'number'
            }
          }
        }
      }
    },

    testOptions: {
      BATTERYv2: {
        batteries: [
          {
            signalkId: 0,
            instanceId: 1
          }
        ]
      }
    },

    conversions: (options) => {
      if ( !_.get(options, 'BATTERYv2.batteries') ) {
        return null
      }
      return options.BATTERYv2.batteries.map(battery => {
        return {
          keys: batteryKeys.map(key => `electrical.batteries.${battery.signalkId}.${key}`),
          timeouts: batteryKeys.map(key => 60000),
          callback: (voltage, current, temperature, stateOfCharge, timeRemaining, stateOfHealth, ripple) => {
            var res = []
            if ( voltage != null
                 || current != null
                 || temperature != null ) {
              res.push({
                pgn: 127508,
                "Battery Instance": battery.instanceId,
                "Instance": battery.instanceId,
                Voltage: voltage,
                Current: current,
                Temperature: temperature
              })
            }
            
            if ( stateOfCharge != null
                 || timeRemaining != null
                 || stateOfHealth != null
                 || ripple != null ) {
              stateOfCharge = _.isUndefined(stateOfCharge) || stateOfCharge == null ? undefined : stateOfCharge*100
              stateOfHealth = _.isUndefined(stateOfHealth) || stateOfHealth == null ? undefined : stateOfHealth*100
              
              res.push({
                pgn: 127506,
                "DC Instance": battery.instanceId,
                "DC Type": "Battery",
                "Instance": battery.instanceId,
                'State of Charge': stateOfCharge,
                'State of Health': stateOfHealth,
                'Time Remaining': timeRemaining,
                'Ripple Voltage': ripple
              })
            }
            return res
          },
          tests: [{
            input: [12.5, 23.1, 290.15, 0.93, 12340, 0.6, 12.0],
            expected: [{
              "prio": 2,
              "pgn": 127508,
              "dst": 255,
              "fields": {
                "Instance": 1,
                "Voltage": 12.5,
                "Current": 23.1,
                "Temperature": 290.15
              }
            },{
              "prio": 2,
              "pgn": 127506,
              "dst": 255,
              "fields": {
                "Instance": 1,
                "DC Type": "Battery",
                "State of Charge": 93,
                "State of Health": 60,
                "Time Remaining": 12340,
                "Ripple Voltage": 12
              }
            }]
          }]
        }
      })
    }
  }
}


