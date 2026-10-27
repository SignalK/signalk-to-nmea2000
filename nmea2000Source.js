// Whether an update came from NMEA 2000. A value the server derives from
// NMEA 2000 data, such as the Course API's navigation.course.nextPoint for a
// course set on a chartplotter, carries no source object, only the $source of
// the device it came from; the type of that device's label is in the sources
// tree, which the server keys by the $source up to its first dot.
function isNmea2000Update(app, { source, $source }) {
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
// first. Until a nextPoint value arrives, and on a server whose Course API
// does not publish its $source, the course is sent.
function courseOrigin(app, allowNmea2000) {
  let fromNmea2000 = false
  return {
    withheld: () => !allowNmea2000 && fromNmea2000,
    conversion: {
      sourceType: 'subscription',
      context: 'vessels.self',
      keys: [ NEXT_POINT ],
      // Sends nothing, so it takes the NMEA 2000 updates it is looking for
      preventsNmea2000Echo: true,
      callback: (delta) => {
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

module.exports = { isNmea2000Update, courseOrigin }
