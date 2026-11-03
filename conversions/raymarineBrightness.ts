import _ from 'lodash'
import {
  PGN_126720_Seatalk1DisplayBrightness,
  SeatalkNetworkGroup
} from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'
import { withPriority } from '../pgn'

interface Group {
  signalkId: string
  instanceId: string
}

module.exports = (app: App, plugin: Plugin): Conversion => {
  return {
    title: 'Raymarine (Seatalk) Display Brightness (126720)',
    optionKey: 'RAYMARINE',
    context: 'vessels.self',
    properties: {
      groups: {
        title: 'Group Mapping',
        type: 'array',
        items: {
          type: 'object',
          properties: {
            signalkId: {
              title: 'Signal K Group id',
              type: 'string',
            },
            instanceId: {
              title: 'NMEA2000 Group Instance Id',
              type: 'string',
            }
          }
        }
      }
    },

    testOptions: {
      RAYMARINE: {
        groups: [{
          signalkId: 'helm2',
          instanceId: 'Helm 2'
        }]
      }
    },

    conversions: (options: any) => {
      if (!_.get(options, 'RAYMARINE.groups')) {
        return null
      }
      return options.RAYMARINE.groups.map((group: Group) => {
        return {
          keys: [`electrical.displays.raymarine.${group.signalkId}.brightness`],
          callback: (brightness: number): PGN_126720_Seatalk1DisplayBrightness[] => {
            // The class sets Raymarine, Marine Industry, Display, Settings
            // and Brightness itself.
            const pgn = withPriority(new PGN_126720_Seatalk1DisplayBrightness({
              // The group name as configured, e.g. "Helm 2"
              group: group.instanceId as SeatalkNetworkGroup,
              // canboatjs 4 takes the brightness as a ratio.
              brightness: brightness
            }, 255))
            // Not among the class's arguments; the message has always sent 0.
            pgn.fields.unknown2 = 0
            return [pgn]
          },
          tests: [{
            input: [0.85],
            expected: [{
              "prio": 2,
              "pgn": 126720,
              "dst": 255,
              "fields": {
                "Manufacturer Code": "Raymarine",
                "Industry Code": "Marine Industry",
                "Proprietary ID": "Display",
                "Group": "Helm 2",
                "command1": "Settings",
                "Command": "Brightness",
                "Brightness": 0.85,
                "Unknown 2": 0
              }
            }]
          }]
        }
      })
    }
  }
}
