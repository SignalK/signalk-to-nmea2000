
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
      input: [ 0.12 ],
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
  }, 
  {
    pgn: 129284,
    title: 'Navigation Data (129284)',
    optionKey: 'navigationdata',
    keys: [
      'navigation.courseRhumbline.nextPoint.distance',
      'navigation.courseRhumbline.bearingToDestinationTrue',
      'navigation.courseRhumbline.bearingOriginToDestinationTrue',
      'navigation.courseRhumbline.nextPoint',
      'navigation.courseRhumbline.nextPoint.velocityMadeGood',
      'notifications.arrivalCircleEntered',
      'notifications.perpendicularPassed',
      'navigation.courseRhumbline.nextPoint.ID'
    ],
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
    },
    tests: [{
      input: [ 12, 1.23, 3.1, { longitude: -75.487264, latitude: 32.0631296 } , 4.0, null, 1, 5 ],
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
          "SID": 136,
          "Distance to Waypoint": 12,
          "Course/Bearing reference": "True",
          "Perpendicular Crossed": "Yes",
          "Arrival Circle Entered": "No",
          "Calculation Type": "Rhumbline",
          "Bearing, Origin to Destination Waypoint": 3.1,
          "Bearing, Position to Destination Waypoint": 1.23,
          "Destination Waypoint Number": 5,
          "Destination Latitude": 32.0631296,
          "Destination Longitude": -75.487264,
          "Waypoint Closing Velocity": 4
        }
      }]
    }]
  },
  {
    pgn: 129284,
    title: 'Navigation Data Great Circle (129284)',
    optionKey: 'navigationdatagc',
    keys: [
      'navigation.courseGreatCircle.nextPoint.distance',
      'navigation.courseGreatCircle.bearingToDestinationTrue',
      'navigation.courseGreatCircle.bearingOriginToDestinationTrue',
      'navigation.courseGreatCircle.nextPoint',
      'navigation.courseGreatCircle.nextPoint.velocityMadeGood',
      'notifications.arrivalCircleEntered',
      'notifications.perpendicularPassed',
      'navigation.courseGreatCircle.nextPoint.ID'
    ],
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
        "Calculation Type" : 0,
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
  }
]
}
