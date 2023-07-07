const _ = require('lodash')

module.exports = (app, plugin) => {

  const solarKeys = [
    'voltage',
    'current',
    'panelCurrent',
    'panelVoltage'
  ]
  
  return {
    title: 'Solar as Battery (127506 & 127508)',
    optionKey: 'SOLAR',
    context: 'vessels.self',
    properties: {
      chargers: {
        title: 'Solar Mapping',
        type: 'array',
        items: {
          type: 'object',
          required: ["signalkId", "instanceId", "panelInstanceId"],
          properties: {
            signalkId: {
              title: 'Signal K Solar id',
              type: 'string'
            },
            instanceId: {
              title: 'NMEA2000 Battery Instance Id',
              description: 'Used for current/voltage',
              type: 'number'
            },
            panelInstanceId: {
              title: 'NMEA2000 Battery Panel Instance Id',
              description: 'Used for panel current/voltage',
              type: 'number'
            }
          }
        }
      }
    },

    conversions: (options) => {
      if ( !_.get(options, 'SOLAR.chargers') ) {
        return null
      }
      return options.SOLAR.chargers.map(charger => {
        return {
          keys: solarKeys.map(key => `electrical.solar.${charger.signalkId}.${key}`),
          timeouts: solarKeys.map(key => 60000),
          callback: (voltage, current, panelCurrent, panelVoltage) => {
            var res = []
            if ( voltage != null
                 || current != null ) {
              res.push({
                pgn: 127508,
                "Battery Instance": charger.instanceId,
                "Instance": charger.instanceId,
                Voltage: voltage,
                Current: current
              })
            }

            if ( panelVoltage != null
                 || panelCurrent != null ) {
              res.push({
                pgn: 127508,
                "Battery Instance": charger.panelInstanceId,
                "Instance": charger.panelInstanceId,
                Voltage: panelVoltage,
                Current: panelCurrent
              })
            }
            
            return res
          }
        }
      })
    }
  }
}


