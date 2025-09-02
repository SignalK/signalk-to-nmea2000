import { ServerAPI, Plugin} from '@signalk/server-api'
import {
  PGN_126720_Seatalk1DisplayBrightness,
  SeatalkShared
} from '@canboat/ts-pgns'
import _ from 'lodash'

module.exports = (app:ServerAPI, plugin:Plugin) => {
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

    conversions: (options:any) => {
      if (!_.get(options, 'RAYMARINE.groups')) {
        return null
      }
      return options.RAYMARINE.groups.map((group:any) => {
        return {
          keys: [`electrical.displays.raymarine.${group.signalkId}.brightness`],
          callback: (brightness:number) => {
            return [
              new PGN_126720_Seatalk1DisplayBrightness({
                group: group.instanceId,
                shared: SeatalkShared.Shared,
                brightness: brightness * 100,
                unknown2: 0
              })
            ]
          },
          tests: [{
            input: [0.85],
            expected: [{
              "__preprocess__": (testResult:any) => {
                //remove camelCase keys (MatchFields)
                delete testResult.fields.manufacturerCode
                delete testResult.fields.industryCode
                delete testResult.fields.proprietaryId
                delete testResult.fields.command
              },
              "prio": 3,
              "pgn": 126720,
              "dst": 255,
              "fields": {
                "Manufacturer Code": "Raymarine",
                "Industry Code": "Marine Industry",
                "Proprietary ID": "Display",
                "command1": "Settings",
                "Group": "Helm 2",
                "Unknown 1": 1,
                "Command": "Brightness",
                "Brightness": 85,
                "Unknown 2": 0
              }
            }]
          }]
        }
      })
    }
  }
}
