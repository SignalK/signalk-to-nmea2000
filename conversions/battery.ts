import _ from 'lodash'
import { PGN_127506, PGN_127508, DcSource } from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'
import { withPriority } from '../pgn'

interface BatteryMapping {
  signalkId: string | number
  instanceId: number
}

module.exports = (app: App, plugin: Plugin): Conversion => {

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
    properties: () => {
      const batteryIds =
        typeof app.getSelfPath === 'function'
          ? Object.keys(app.getSelfPath('electrical.batteries') || {}).filter(
              id => id !== 'meta'
            )
          : []
      return {
        batteries: {
          title: 'Battery Mapping',
          type: 'array',
          items: {
            type: 'object',
            properties: {
              signalkId: {
                title: 'Signal K battery id',
                description:
                  'Pick a battery id currently present under electrical.batteries or enter one manually',
                type: 'string',
                examples: batteryIds
              },
              instanceId: {
                title: 'NMEA2000 Battery Instance Id',
                type: 'number'
              }
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

    conversions: (options: any) => {
      if ( !_.get(options, 'BATTERYv2.batteries') ) {
        return undefined
      }
      return options.BATTERYv2.batteries.map((battery: BatteryMapping) => {
        return {
          keys: batteryKeys.map(key => `electrical.batteries.${battery.signalkId}.${key}`),
          timeouts: batteryKeys.map(key => 60000),
          callback: (
            voltage?: number | null,
            current?: number | null,
            temperature?: number | null,
            stateOfCharge?: number | null,
            timeRemaining?: number | null,
            stateOfHealth?: number | null,
            ripple?: number | null
          ): (PGN_127506 | PGN_127508)[] => {
            var res: (PGN_127506 | PGN_127508)[] = []
            if ( voltage != null
                 || current != null
                 || temperature != null ) {
              res.push(
                withPriority(
                  new PGN_127508({
                    instance: battery.instanceId,
                    voltage: voltage as number | undefined,
                    current: current as number | undefined,
                    temperature: temperature as number | undefined
                  })
                )
              )
            }
            
            if ( stateOfCharge != null
                 || timeRemaining != null
                 || stateOfHealth != null
                 || ripple != null ) {
              // canboatjs 4 takes the states as ratios, as Signal K gives them.
              stateOfCharge = stateOfCharge == null ? undefined : stateOfCharge
              stateOfHealth = stateOfHealth == null ? undefined : stateOfHealth
              
              res.push(
                withPriority(
                  new PGN_127506({
                    instance: battery.instanceId,
                    dcType: DcSource.Battery,
                    stateOfCharge: stateOfCharge as number | undefined,
                    stateOfHealth: stateOfHealth as number | undefined,
                    timeRemaining: timeRemaining as number | undefined,
                    rippleVoltage: ripple as number | undefined
                  })
                )
              )
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
                "State of Charge": 0.93,
                "State of Health": 0.6,
                "Time Remaining": 12360,
                "Ripple Voltage": 12
              }
            }]
          }]
        }
      })
    }
  }
}


