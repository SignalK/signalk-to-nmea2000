import { PGN_127245 } from '@canboat/ts-pgns'
import { Type } from 'typebox'
import { App, Plugin, Conversion } from '../types'
import { type PluginOptions, settingsOf } from '../schema'
import { withPriority } from '../pgn'

// The rudder angle as reported by a rudder angle sensor. Signal K has no
// path for the angle order, so only the position is sent.
const defaultInstance = 0

const rudderProperties = {
  instance: Type.Optional(
    Type.Integer({
      title: 'N2K Rudder Instance',
      description: 'Tells apart several rudders; 0 for a single rudder',
      minimum: 0,
      maximum: 252,
      default: defaultInstance
    })
  )
}
const RudderSettings = Type.Object(rudderProperties)

module.exports = (app: App, plugin: Plugin): Conversion => {
  return {
    pgn: 127245,
    title: 'Rudder (127245)',
    optionKey: 'RUDDER',
    keys: ['steering.rudderAngle'],
    properties: rudderProperties,

    testOptions: [{ RUDDER: { instance: 1 } }, { RUDDER: {} }],

    conversions: (options: PluginOptions) => {
      const instance =
        settingsOf(options, 'RUDDER', RudderSettings)?.instance ??
        defaultInstance
      return [
        {
          keys: ['steering.rudderAngle'],
          callback: (angle: number): PGN_127245[] => {
            return [
              withPriority(
                new PGN_127245({
                  instance,
                  position: angle
                })
              )
            ]
          },
          tests: [
            {
              input: [-0.1745],
              expected: [
                (testOptions: any) => ({
                  prio: 2,
                  pgn: 127245,
                  dst: 255,
                  fields: {
                    Instance: testOptions.RUDDER.instance ?? defaultInstance,
                    Position: -0.1745
                  }
                })
              ]
            }
          ]
        }
      ]
    }
  }
}
