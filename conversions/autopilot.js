// const { DateTime } = require('luxon')
const debug = require('debug')('signalk-to-nmea2000/conversions/autopilot')


/**
 * APB: 127237 (Heading/Track control) X, 129283 (Cross Track Error) X, 129284 (Navigation Data) X
 * RMC: 127258 (Magnetic Variation) X
 *
 * One also should enable conversions for (if not present on network):
 * - systemTime
 * - cogSOG
 * - heading
 * - gps
 */

module.exports = (app, plugin) => {
  return {
    pgns: [ 127237, 129283, 129284, 127258 ],
    title: 'Autopilot Routing Data',
    optionKey: 'AUTOPILOTv2',
    keys: [
      'navigation.headingMagnetic',
      'navigation.headingTrue',
      'navigation.magneticVariation',
      'navigation.magneticVariationAgeOfService',
      'navigation.courseRhumbline.crossTrackError',
      'navigation.courseRhumbline.nextPoint',
      'navigation.courseRhumbline.nextPoint.bearingTrue',
      'navigation.courseRhumbline.nextPoint.velocityMadeGood',
      'navigation.courseRhumbline.nextPoint.distance'
    ],
    callback: (headingMagnetic, headingTrue, magneticVariation, magneticVariationAgeOfService, XTE, nextPointPosition, bearingTrue, velocityMadeGood, distance) => {
      const validNextPointPosition = (nextPointPosition && typeof nextPointPosition === 'object' && nextPointPosition.hasOwnProperty('latitude') && nextPointPosition.hasOwnProperty('longitude'))

      return [
        (!distance || !bearingTrue || !validNextPointPosition) ? null : {
          pgn: 129284,
          SID: 87,
          'Distance to Waypoint': distance,
          'Course/Bearing reference': 0, // true
          'Calculation Type': 1, // rhumbline
          // 'ETA Time': -1, // seconds since midnight
          // 'ETA Date': -1, // days since epoch
          // 'Bearing, Origin to Destination Waypoint': -1,
          'Bearing, Position to Destination Waypoint': bearingTrue,
          // 'Origin Waypoint Number': -1,
          // 'Destination Waypoint Number': -1,
          'Destination Latitude': nextPointPosition.latitude,
          'Destination Longitude': nextPointPosition.longitude
        },
        (!bearingTrue || !headingTrue) ? null : {
          pgn: 127237,
          'Heading-To-Steer (Course)': bearingTrue,
          // 'Track': -1,
          'Vessel Heading': headingTrue
        },
        !XTE ? null : {
          pgn: 129283, // XTE
          SID: 87,
          'XTE mode': 2, // Estimated
          XTE
        },
        (!magneticVariation || !magneticVariationAgeOfService) ? null : {
          pgn: 127258, // Magnetic variation
          SID: 87,
          Source: 1, // Automatic Chart
          Variation: magneticVariation, // Variation with resolution 0.0001 in rad,
          'Age of service': Math.floor(magneticVariationAgeOfService / 86400000) // Days since epoch
        }
      ].filter(pgn => (pgn !== null)).map(pgn => {
        debug(`Sending PGN ${pgn.pgn}: ${JSON.stringify(pgn, null, 2)}`)
        return pgn
      })
    }
  }
}
