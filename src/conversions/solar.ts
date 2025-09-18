import { ServerAPI, Plugin} from '@signalk/server-api'
import {
  PGN,
  PGN_127508,
} from '@canboat/ts-pgns'
import _ from 'lodash'

module.exports = (app:ServerAPI, plugin:Plugin) => {

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

    testOptions: {
      SOLAR: {
        chargers:[{
          signalkId: 'bimini',
          instanceId: 10,
          panelInstanceId: 11
        }]
      }
    },
    
    conversions: (options:any): PGN_127508[]|undefined => {
      if ( !_.get(options, 'SOLAR.chargers') ) {
        return
      }
      return options.SOLAR.chargers.map((charger:any) => {
        return {
          keys: solarKeys.map(key => `electrical.solar.${charger.signalkId}.${key}`),
          timeouts: solarKeys.map(key => 60000),
          callback: (voltage:number, current:number, panelCurrent:number, panelVoltage:number) => {
            const res : PGN_127508[] = []
            if ( voltage != null
                 || current != null ) {
              res.push(new PGN_127508({
                instance: charger.instanceId,
                voltage: voltage,
                current: current
              }))
            }

            if ( panelVoltage != null
                 || panelCurrent != null ) {
              res.push(new PGN_127508({
                instance: charger.panelInstanceId,
                voltage: panelVoltage,
                current: panelCurrent
              }))
            }
            
            return res
          },
          tests: [{
            input: [ 13, 5, 2, 45.0 ],
            expected: [{
              "prio": 6,
              "pgn": 127508,
              "dst": 255,
              "fields": {
                "Instance": 10,
                "Voltage": 13,
                "Current": 5
              }
            },{
              "prio": 6,
              "pgn": 127508,
              "dst": 255,
              "fields": {
                "Instance": 11,
                "Voltage": 45,
                "Current": 2
              }
            }]
          }]
        }
      })
    }
  }
}


