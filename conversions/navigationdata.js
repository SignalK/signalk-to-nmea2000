
module.exports = (app, plugin) => {
  return [{
    pgn: 129283,
    title: 'Cross Track Error (129283)',
    optionKey: 'xte',
    keys: [
      'navigation.courseRhumbline.crossTrackError'
    ],
    callback: (XTE) => [{
      pgn: 129283,
      XTE,
      "XTE mode": "Autonomous",
      "Navigation Terminated": "No"
    }],
    tests: [{
      input: [0.12],
      expected: [{
        "prio": 2,
        "pgn": 129283,
        "dst": 255,
        "fields": {
          "XTE mode": "Autonomous",
          "Navigation Terminated": "No",
          "XTE": 0.12
        }
      }]
    }]
  }, {
    pgn: 129284,
    title: 'Navigation Data (129284)',
    optionKey: 'navigationdata',
    keys: [
      'navigation.course.calcValues.distance',
      'navigation.course.calcValues.bearingTrue',
      'navigation.course.calcValues.bearingTrackTrue',
      'navigation.course.nextPoint',
      'navigation.course.calcValues.timeToGo',
      'navigation.course.calcValues.velocityMadeGood',
      'navigation.course.arrivalCircleEntered',
      'navigation.course.perpendicularPassed',
    ],
    callback: (distToDest, bearingToDest, bearingOriginToDest, dest, secondsToGo, vmg, ace, pp) => {
      var dateObj = new Date();
      var etaDate = Math.trunc((dateObj.getTime() / 1000 + secondsToGo) / 86400);
      var etaTime = (dateObj.getUTCHours() * (60 * 60) +
        dateObj.getUTCMinutes() * 60 +
        dateObj.getUTCSeconds() +
        secondsToGo) % 86400;

      return [{
        pgn: 129284,
        "Distance to Waypoint": distToDest,
        "Course/Bearing reference": "True",
        "Perpendicular Crossed": pp != null,
        "Arrival Circle Entered": ace != null,
        "Calculation Type": "Great Circle",
        "ETA Time": (vmg > 0) ? etaTime : undefined,
        "ETA Date": (vmg > 0) ? etaDate : undefined,
        "Bearing, Origin to Destination Waypoint": bearingOriginToDest,
        "Bearing, Position to Destination Waypoint": bearingToDest,
        "Destination Latitude": dest.latitude,
        "Destination Longitude": dest.longitude,
        "Waypoint Closing Velocity": vmg,
      }]
    },
    tests: [{
      input: [12, 1.23, 3.1, { longitude: -75.487264, latitude: 32.0631296 }, 60, 4.0, null, null],
      expected: [{
        "__preprocess__": (testResult) => {
          //these change every time
          delete testResult.fields["ETA Date"]
          delete testResult.fields["ETA Time"]
        },
        "prio": 2,
        "pgn": 129284,
        "dst": 255,
        "fields": {
          "Distance to Waypoint": 12,
          "Course/Bearing reference": "True",
          "Perpendicular Crossed": "No",
          "Arrival Circle Entered": "No",
          "Calculation Type": "Great Circle",
          "Bearing, Origin to Destination Waypoint": 3.1,
          "Bearing, Position to Destination Waypoint": 1.23,
          "Destination Latitude": 32.0631296,
          "Destination Longitude": -75.487264,
          "Waypoint Closing Velocity": 4
        }
      }]
    }]
  }]
}
