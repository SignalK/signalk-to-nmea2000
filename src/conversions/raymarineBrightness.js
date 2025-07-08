const _ = require('lodash')

module.exports = (app, plugin) => {
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

    conversions: (options) => {
      if (!_.get(options, 'RAYMARINE.groups')) {
        return null
      }
      return options.RAYMARINE.groups.map(group => {
        return {
          keys: [`electrical.displays.raymarine.${group.signalkId}.brightness`],
          callback: (brightness) => {
            return [{
              pgn: 126720,
              "dst": 255,
              "Manufacturer Code": "Raymarine",
              "Industry Code": "Marine Industry",
              "Proprietary ID": "0x0c8c",
              "Group": group.instanceId,
              "Unknown 1": 1,
              "Command": "Brightness",
              "Brightness": brightness * 100,
              "Unknown 2": 0
            }]
          },
          tests: [{
            input: [0.85],
            expected: [{
              "__preprocess__": (testResult) => {
                delete testResult.fields.manufacturerCode
                delete testResult.fields.industryCode
                delete testResult.fields.proprietaryId
              },
              "prio": 2,
              "pgn": 126720,
              "dst": 255,
              "fields": {
                "Manufacturer Code": "Raymarine",
                "Industry Code": "Marine Industry",
                "Proprietary ID": "0x0c8c",
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
