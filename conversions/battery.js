const Concentrate2 = require("concentrate2");
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
                'State of Charge': stateOfCharge,
                'State of Health': stateOfHealth,
              'Time Remaining': timeRemaining,
                'Ripple Voltage': ripple
              })
            }
            return res
          }
        }
      })
    }
  }
}


