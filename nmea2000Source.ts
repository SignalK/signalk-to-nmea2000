import { App, Conversion } from './types'

// Whether an update came from NMEA 2000. A value the server derives from
// NMEA 2000 data, such as the Course API's navigation.course.nextPoint for a
// course set on a chartplotter, carries no source object, only the $source of
// the device it came from; the type of that device's label is in the sources
// tree, which the server keys by the $source up to its first dot.
interface Update {
  source?: { type?: string }
  $source?: string
  values?: { path: string; value: unknown }[]
}

export function isNmea2000Update(app: App, { source, $source }: Update): boolean {
  if (source)
    return source.type === 'NMEA2000'
  if (typeof $source !== 'string')
    return false
  const dot = $source.indexOf('.')
  const label = dot === -1 ? $source : $source.slice(0, dot)
  const sources = app.getPath ? app.getPath('sources') : undefined
  return sources?.[label]?.type === 'NMEA2000'
}

const NEXT_POINT = 'navigation.course.nextPoint'

// Follows whether the active course came from NMEA 2000. The Course API takes
// the destination of a chartplotter's 129284 and publishes it at
// navigation.course.nextPoint with that device's $source; sending it, its
// route or the values calculated for it would put a second copy of the
// chartplotter's own course on the bus. The last update decides: the cache a
// server without security replays when the subscription starts comes oldest
// first. The origin is known only from a nextPoint update: a server with
// security replays nothing to a plugin subscription, so a course from NMEA
// 2000 that is already active when the plugin starts is sent until the course
// next changes. A server whose Course API does not publish the $source
// (before 2.12.0) never marks a course as from NMEA 2000, so it is sent.
export function courseOrigin(
  app: App,
  allowNmea2000: boolean
): { withheld: () => boolean; conversion: Conversion } {
  let fromNmea2000 = false
  return {
    withheld: () => !allowNmea2000 && fromNmea2000,
    conversion: {
      sourceType: 'subscription',
      context: 'vessels.self',
      keys: [ NEXT_POINT ],
      // Sends nothing, so it takes the NMEA 2000 updates it is looking for
      preventsNmea2000Echo: true,
      callback: (delta: { updates?: Update[] }) => {
        (delta.updates || []).forEach(update => {
          if (update.values?.some(pathValue => pathValue.path === NEXT_POINT))
            fromNmea2000 = isNmea2000Update(app, update)
        })
        return null
      },
      tests: [{
        input: [{ updates: [{ $source: 'courseApi', values: [{ path: NEXT_POINT, value: null }] }] }],
        expected: []
      }]
    }
  }
}

