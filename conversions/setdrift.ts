import { PGN_129291, DirectionReference } from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'
import { NAVIGATION_TIMEOUT } from '../timeouts'

// environment.current is one object, as NMEA 2000 (129291, 130577) and
// NMEA 0183 (VDR) sources write it
interface Current {
  setTrue?: number | null
  setMagnetic?: number | null
  drift?: number | null
}

module.exports = (app: App, plugin: Plugin): Conversion => {
  return {
    title: 'Set/Drift (129291)',
    optionKey: 'SetDrift',
    keys: ['environment.current'],
    timeouts: [NAVIGATION_TIMEOUT],
    callback: (current: Current | null): PGN_129291[] => {
      if (current == null || typeof current !== 'object') {
        return []
      }
      const [set, setReference] =
        current.setTrue != null
          ? [current.setTrue, DirectionReference.True]
          : current.setMagnetic != null
            ? [current.setMagnetic, DirectionReference.Magnetic]
            : [undefined, undefined]
      if (set === undefined && current.drift == null) {
        return []
      }
      return [
        new PGN_129291({
          set,
          drift: current.drift ?? undefined,
          setReference
        })
      ]
    },

    tests: [
      {
        input: [{ setTrue: 2.0944, drift: 1.2 }],
        expected: [
          {
            pgn: 129291,
            dst: 255,
            prio: 3,
            fields: {
              Drift: 1.2,
              Set: 2.0944,
              'Set Reference': 'True'
            }
          }
        ]
      },
      {
        input: [{ setMagnetic: 1.0944, drift: 1.5 }],
        expected: [
          {
            pgn: 129291,
            dst: 255,
            prio: 3,
            fields: {
              Drift: 1.5,
              Set: 1.0944,
              'Set Reference': 'Magnetic'
            }
          }
        ]
      },
      {
        // True is preferred when a source gives both
        input: [{ setTrue: 2.0944, setMagnetic: 1.0944, drift: 1.2 }],
        expected: [
          {
            pgn: 129291,
            dst: 255,
            prio: 3,
            fields: {
              Drift: 1.2,
              Set: 2.0944,
              'Set Reference': 'True'
            }
          }
        ]
      },
      {
        input: [{ drift: 0.8 }],
        expected: [
          {
            pgn: 129291,
            dst: 255,
            prio: 3,
            fields: {
              Drift: 0.8
            }
          }
        ]
      },
      {
        input: [{}],
        expected: []
      }
    ]
  }
}
