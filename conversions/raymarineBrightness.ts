import {
  PGN_126720_Seatalk1DisplayBrightness,
  SeatalkNetworkGroup
} from '@canboat/ts-pgns'
import { Type } from 'typebox'
import { App, Plugin, Conversion } from '../types'
import { type PluginOptions, settingsOf } from '../schema'
import { withPriority } from '../pgn'

const brightnessProperties = {
  groups: Type.Optional(
    Type.Array(
      Type.Object({
        signalkId: Type.Optional(Type.String({ title: 'Signal K Group id' })),
        instanceId: Type.Optional(
          Type.String({ title: 'NMEA2000 Group Instance Id' })
        )
      }),
      { title: 'Group Mapping' }
    )
  )
}
const BrightnessSettings = Type.Object(brightnessProperties)

module.exports = (app: App, plugin: Plugin): Conversion => {
  return {
    title: 'Raymarine (Seatalk) Display Brightness (126720)',
    optionKey: 'RAYMARINE',
    context: 'vessels.self',
    properties: brightnessProperties,

    testOptions: {
      RAYMARINE: {
        groups: [
          {
            signalkId: 'helm2',
            instanceId: 'Helm 2'
          }
        ]
      }
    },

    conversions: (options: PluginOptions) => {
      const settings = settingsOf(options, 'RAYMARINE', BrightnessSettings)
      if (!settings?.groups) {
        return null
      }
      return settings.groups.map((group) => {
        return {
          keys: [`electrical.displays.raymarine.${group.signalkId}.brightness`],
          callback: (
            brightness: number
          ): PGN_126720_Seatalk1DisplayBrightness[] => {
            // The class sets Raymarine, Marine Industry, Display, Settings
            // and Brightness itself.
            const pgn = withPriority(
              new PGN_126720_Seatalk1DisplayBrightness(
                {
                  // The group name as configured, e.g. "Helm 2"
                  group: group.instanceId as SeatalkNetworkGroup,
                  // canboatjs 4 takes the brightness as a ratio.
                  brightness: brightness
                },
                255
              )
            )
            // Not a constructor argument, nor filled in by the class: sent as 0.
            pgn.fields.unknown2 = 0
            return [pgn]
          },
          tests: [
            {
              input: [0.85],
              expected: [
                {
                  prio: 2,
                  pgn: 126720,
                  dst: 255,
                  fields: {
                    'Manufacturer Code': 'Raymarine',
                    'Industry Code': 'Marine Industry',
                    'Proprietary ID': 'Display',
                    Group: 'Helm 2',
                    command1: 'Settings',
                    Command: 'Brightness',
                    Brightness: 0.85,
                    'Unknown 2': 0
                  }
                }
              ]
            }
          ]
        }
      })
    }
  }
}
