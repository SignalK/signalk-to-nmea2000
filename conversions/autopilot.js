const { DateTime } = require('luxon')

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
    title: 'Autopilot Routing Data',
    optionKey: 'AUTOPILOTv1',
    keys: [
      'navigation.headingMagnetic',
      'navigation.magneticVariation',
      'navigation.courseRhumbline.crossTrackError',
      'navigation.courseRhumbline'
    ],
    callback: (heading, variation, XTE, courseRhumbline) => {
      const now = DateTime.local()
      const days = Math.floor(now.toMillis() / 86400000) // Days since January 1, 1970

      console.log('[navigation.courseRhumbline]', JSON.stringify(courseRhumbline, null, 2))
      return [
        /*
        {
          pgn: 129284,
          SID: 87,
          'Distance to Waypoint': -1,
          'Course/Bearing reference': 1, // magnetic
          'Perpendicular Crossed': 0, // no
          'Arrival Circle Entered': 0, // no
          'Calculation Type': 1, // rhumbline
          'ETA Time': -1, // seconds since midnight
          'ETA Date': -1, // days since epoch
          'Bearing, Origin to Destination Waypoint': -1,
          'Bearing, Position to Destination Waypoint': -1,
          'Origin Waypoint Number': -1,
          'Destination Waypoint Number': -1,
          'Destination Latitude': -1,
          'Destination Longitude': -1,
          'Waypoint Closing Velocity': -1
        },
        {
          pgn: 127237,
          'Rudder Limit Exceeded': -1,
          'Off-Heading Limit Exceeded': -1,
          'Off-Track Limit Exceeded': -1,
          Override: -1,
          'Steering Mode': -1,
          'Turn Mode': -1,
          'Heading Reference': -1,
          'Commanded Rudder Direction': -1,
          'Commanded Rudder Angle': -1,
          'Heading-To-Steer (Course)': -1,
          'Track': -1,
          'Rudder Limit': -1,
          'Off-Heading Limit': -1,
          'Radius of Turn Order': -1,
          'Rate of Turn Order': -1,
          'Off-Track Limit': -1,
          'Vessel Heading': heading
        },
        // */
        {
          pgn: 129283, // XTE
          SID: 87,
          'XTE mode': 2, // Estimated
          'Navigation Terminated': 0, // No
          XTE
        },
        {
          pgn: 127258, // Magnetic variation
          SID: 87,
          Source: 1, // Automatic Chart
          Variation: variation, // Variation with resolution 0.0001 in rad,
          'Age of service': days, // Days since epoch
        }
      ]
    }
  }
}
