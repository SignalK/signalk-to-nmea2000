
module.exports = (app, plugin) => {

  const apiVersion = app.config.version ? parseInt(app.config.version.split('.')[0]) : 1
  const pgn129283Keys = apiVersion > 1
    ? ['navigation.course.calcValues.crossTrackError']
    : ['navigation.courseGreatCircle.crossTrackError']

  const pgn129284Keys = apiVersion > 1
    ? [
      'navigation.course.calcValues.distance',
      'navigation.course.calcValues.bearingTrue',
      'navigation.course.calcValues.bearingTrackTrue',
      'navigation.course.nextPoint.position',
      'navigation.course.calcValues.velocityMadeGood',
      'notifications.course.arrivalCircleEntered',
      'notifications.course.perpendicularPassed',
      'navigation.course.activeRoute.pointIndex'
    ]
    : [
      'navigation.courseGreatCircle.nextPoint.distance',
      'navigation.courseGreatCircle.bearingToDestinationTrue',
      'navigation.courseGreatCircle.bearingOriginToDestinationTrue',
      'navigation.courseGreatCircle.nextPoint',
      'navigation.courseGreatCircle.nextPoint.velocityMadeGood',
      'notifications.arrivalCircleEntered',
      'notifications.perpendicularPassed',
      'navigation.courseRhumbline.nextPoint.ID'
    ]

  return [{
    pgn: 129283,
    title: 'Cross Track Error (129283)',
    optionKey: 'xte',
    keys: pgn129283Keys,
    callback: (XTE) => [{
      pgn: 129283,
      XTE,
      "XTE mode": "Autonomous",
      "Navigation Terminated": "No"
    }]
  }, {
    pgn: 129284,
    title: 'Navigation Data (129284)',
    optionKey: 'navigationdata',
    keys: pgn129284Keys,
    timeouts: [
      10000, 10000, 10000, 10000, 10000, undefined, undefined, 10000
    ],
    callback: (distToDest, bearingToDest, bearingOriginToDest, dest, WCV, ace, pp, wpid) => {
      var dateObj = new Date();
      var secondsToGo = Math.trunc(distToDest / WCV);
      var etaDate = Math.trunc((dateObj.getTime() / 1000 + secondsToGo) / 86400);
      var etaTime = (dateObj.getUTCHours() * (60 * 60) +
                     dateObj.getUTCMinutes() * 60 +
                     dateObj.getUTCSeconds() +
                     secondsToGo) % 86400;

      return [{
        pgn: 129284,
        "SID" : 0x88,
        "Distance to Waypoint" :  distToDest,
        "Course/Bearing reference" : 0,
        "Perpendicular Crossed" : pp != null,
        "Arrival Circle Entered" : ace != null,
        "Calculation Type" : 1,
        "ETA Time" : (WCV > 0) ? etaTime : undefined,
        "ETA Date": (WCV > 0) ? etaDate : undefined,
        "Bearing, Origin to Destination Waypoint" : bearingOriginToDest,
        "Bearing, Position to Destination Waypoint" : bearingToDest,
        "Origin Waypoint Number" : undefined,
        "Destination Waypoint Number" : parseInt(wpid),
        "Destination Latitude" : dest.latitude,
        "Destination Longitude" : dest.longitude,
        "Waypoint Closing Velocity" : WCV,
      }]
    }
  }]
}
