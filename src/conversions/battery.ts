import { ServerAPI, Plugin} from '@signalk/server-api'
import {
  PGN,
  PGN_127508,
  PGN_127508Defaults,
  PGN_127506,
  PGN_127506Defaults,
  DcSource
} from '@canboat/ts-pgns'
import _ from 'lodash'

module.exports = (app:ServerAPI, plugin:Plugin) => {

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

    conversions: (options:any) => {
      if ( !_.get(options, 'BATTERYv2.batteries') ) {
        return null
      }
      return options.BATTERYv2.batteries.map((battery:any) => {
        return {
          keys: batteryKeys.map(key => `electrical.batteries.${battery.signalkId}.${key}`),
          timeouts: batteryKeys.map(key => 60000),
          callback: (voltage:number, current:number, temperature:number, stateOfCharge:number, timeRemaining:number, stateOfHealth:number, ripple:number) => {
            var res:PGN[] = []
            if ( voltage != null
                 || current != null
                 || temperature != null ) {
              const pgn: PGN_127508 = {
                ...PGN_127508Defaults,
                fields: {
                  instance: battery.instanceId,
                  voltage: voltage,
                  current: current,
                  temperature: temperature
                }
              }
              res.push(pgn)
            }
            
            if ( stateOfCharge != null
                 || timeRemaining != null
                 || stateOfHealth != null
                 || ripple != null ) {
              const n2kStateOfCharge = _.isUndefined(stateOfCharge) || stateOfCharge == null ? undefined : stateOfCharge*100
              const n2KStateOfHealth = _.isUndefined(stateOfHealth) || stateOfHealth == null ? undefined : stateOfHealth*100

              const pgn: PGN_127506 = {
                ...PGN_127506Defaults,
                fields: {
                  dcType: DcSource.Battery,
                  instance: battery.instanceId,
                  stateOfCharge: n2kStateOfCharge,
                  stateOfHealth: n2KStateOfHealth,
                  timeRemaining,
                  rippleVoltage: ripple
                }
              }
              res.push(pgn)
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
                "Time Remaining": "03:26:00",
                "Ripple Voltage": 12
              }
            }]
          }]
        }
      })
    }
  }
}


