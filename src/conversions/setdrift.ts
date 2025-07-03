import { ServerAPI, Plugin} from '@signalk/server-api'
import { PGN_129291, PGN_129291Defaults, DirectionReference } from '@canboat/ts-pgns'

module.exports = (app:ServerAPI, plugin:Plugin) => {
  return {
    title: 'Set/Drift (129291)',
    optionKey: 'SetDrift',
    keys: ["environment.current.setTrue", "environment.current.drift"],
    callback: (set:number, drift:number): PGN_129291[]|undefined => {
      try {
        return [
          {
            ...PGN_129291Defaults,
            fields: {
              set: set,
              drift: drift,
              setReference: DirectionReference.True
            }
          }
        ]
      } catch ( err ) {
        console.error(err)
      }
    },

    tests: [{
      input: [ 2.0944, 1.2 ],
      expected: [
        {
          pgn: 129291,
          dst: 255,
          prio: 3,
          fields: {
            'Drift': 1.2,
            'Set': 2.0944,
            'Set Reference': "True"
          }
        }
      ]
    },{
      input: [ 1.0944, 1.5 ],
      expected: [
        {
          pgn: 129291,
          dst: 255,
          prio: 3,
          fields: {
            'Drift': 1.5,
            'Set': 1.0944,
            'Set Reference': "True"
          }
        }
      ]
    }]
  }
}

