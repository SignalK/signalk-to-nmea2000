import { PGN_129291, DirectionReference } from '@canboat/ts-pgns'
import { App, Plugin, Conversion } from '../types'
import { NAVIGATION_TIMEOUT } from '../timeouts'

// NMEA 2000 (129291, 130577) and NMEA 0183 (VDR) sources write the current
// as one object, environment.current. signalk-derived-data writes its
// values as separate paths.
interface Current {
  setTrue?: unknown
  setMagnetic?: unknown
  drift?: unknown
}

const number = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

module.exports = (app: App, plugin: Plugin): Conversion => {
  return {
    title: 'Set/Drift (129291)',
    optionKey: 'SetDrift',
    keys: [
      'environment.current',
      'environment.current.setTrue',
      'environment.current.setMagnetic',
      'environment.current.drift'
    ],
    timeouts: [
      NAVIGATION_TIMEOUT,
      NAVIGATION_TIMEOUT,
      NAVIGATION_TIMEOUT,
      NAVIGATION_TIMEOUT
    ],
    callback: (
      current: Current | null,
      setTrue: unknown,
      setMagnetic: unknown,
      drift: unknown
    ): PGN_129291[] => {
      const object =
        current != null && typeof current === 'object' ? current : {}
      // A source picked for a separate path applies to it alone, so those
      // come first
      const values = {
        setTrue: number(setTrue) ?? number(object.setTrue),
        setMagnetic: number(setMagnetic) ?? number(object.setMagnetic),
        drift: number(drift) ?? number(object.drift)
      }
      const [set, setReference] =
        values.setTrue !== undefined
          ? [values.setTrue, DirectionReference.True]
          : values.setMagnetic !== undefined
            ? [values.setMagnetic, DirectionReference.Magnetic]
            : [undefined, undefined]
      if (set === undefined && values.drift === undefined) {
        return []
      }
      return [
        new PGN_129291({
          set,
          drift: values.drift,
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
        // As signalk-derived-data writes it
        input: [null, 2.0944, 1.9944, 0.8],
        expected: [
          {
            pgn: 129291,
            dst: 255,
            prio: 3,
            fields: {
              Drift: 0.8,
              Set: 2.0944,
              'Set Reference': 'True'
            }
          }
        ]
      },
      {
        // The separate paths come first, the object fills in
        input: [{ setTrue: 1.5, drift: 0.8 }, 2.0944, null, null],
        expected: [
          {
            pgn: 129291,
            dst: 255,
            prio: 3,
            fields: {
              Drift: 0.8,
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
        // A value that is not a number is not sent
        input: [{ setTrue: '2', drift: true }, null, null, Infinity],
        expected: []
      },
      {
        input: [{}],
        expected: []
      }
    ]
  }
}
