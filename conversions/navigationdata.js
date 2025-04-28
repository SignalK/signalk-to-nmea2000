const sourceDataKeys = [
  'Rhumbline',
  'Great Circle',
  'Course API v2'
]

const crossTrackErrorKeys = {
  'Course API v2': [ 'navigation.course.calcValues.crossTrackError' ],
  'Rhumbline':     [ 'navigation.courseRhumbline.crossTrackError' ],
  'Great Circle':  [ 'navigation.courseGreatCircle.crossTrackError' ],
}

const navigationDataKeys = {
  'Course API v2': [
    'navigation.course.calcValues.distance',
    'navigation.course.calcValues.bearingTrue',
    'navigation.course.calcValues.bearingMagnetic',
    'navigation.course.calcValues.bearingTrackTrue',
    'navigation.course.calcValues.bearingTrackMagnetic',
    'navigation.course.calcValues.velocityMadeGood',
    'navigation.course.calcValues.calcMethod',
    'notifications.arrivalCircleEntered',
    'notifications.perpendicularPassed',
  ],
  'Rhumbline':     [
    'navigation.courseRhumbline.nextPoint.distance',
    'navigation.courseRhumbline.bearingToDestinationTrue',
    'navigation.courseRhumbline.bearingToDestinationMagnetic',
    'navigation.courseRhumbline.bearingOriginToDestinationTrue',
    'navigation.courseRhumbline.bearingOriginToDestinationMagnetic',
    'navigation.courseRhumbline.nextPoint.velocityMadeGood',
    'noop',
    'notifications.arrivalCircleEntered',
    'notifications.perpendicularPassed',
  ],
  'Great Circle':  [
    'navigation.courseGreatCircle.nextPoint.distance',
    'navigation.courseGreatCircle.bearingToDestinationTrue',
    'navigation.courseGreatCircle.bearingToDestinationMagnetic',
    'navigation.courseGreatCircle.bearingOriginToDestinationTrue',
    'navigation.courseGreatCircle.bearingOriginToDestinationMagnetic',
    'navigation.courseGreatCircle.nextPoint.velocityMadeGood',
    'noop',
    'notifications.arrivalCircleEntered',
    'notifications.perpendicularPassed',
  ],
}

module.exports = (app, plugin) => {
  return [{
    title: 'Cross Track Error (129283)',
    optionKey: 'xte',
    properties: {
      sourcedata: {
        title: 'Source Data',
        type: 'string',
        enum: [
          'Rhumbline',
          'Great Circle',
          'Course API v2'
        ]
      }
    },
    conversions: (options) => {
      sourcedata = options?.xte?.sourcedata || "Course API v2"
      return [{
        keys: crossTrackErrorKeys[sourcedata],
        sourceType: 'timer',
        interval: 1000,
        callback: (app, crossTrackError) => {
          if (crossTrackError == null)
            return null

          return [{
            pgn: 129283,
            "XTE": crossTrackError,
            "XTE mode": "Autonomous",
            "Navigation Terminated": "No"
          }]
        },
        tests: [{
          input: [ null, 0.12 ],
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
      }]
    }
  },
  {
    title: 'Navigation Data (129284)',
    optionKey: 'navigationdata',
    properties: {
      sourcedata: {
        title: 'Source Data',
        type: 'string',
        enum: [
          'Rhumbline',
          'Great Circle',
          'Course API v2'
        ]
      }
    },
    conversions: (options) => {
      var sourcedata = options?.navigationdata?.sourcedata || "Course API v2"
      return [{
        keys: navigationDataKeys[sourcedata],
        interval: 1000,
        sourceType: 'timer',
        callback: async (app,
          distance,
          bearingTrue,
          bearingMagnetic,
          bearingTrackTrue,
          bearingTrackMagnetic,
          velocityMadeGood,
          calcMethod,
          arrivalCircleEntered,
          perpendicularPassed
        ) => {
          var course = await app.courseApi.getCourse()
          if (course.nextPoint == null)
            return null

          var dateObj = new Date();
          var secondsToGo = Math.trunc(distance / velocityMadeGood);

          var etaDate = Math.trunc((dateObj.getTime() / 1000 + secondsToGo) / 86400);
          var etaTime = (dateObj.getUTCHours() * (60 * 60) +
                         dateObj.getUTCMinutes() * 60 +
                         dateObj.getUTCSeconds() +
                         secondsToGo) % 86400;

          var bearing, bearingReference, bearingTrack
          if (bearingTrue != null && bearingTrackTrue != null)
          {
            bearingReference = 0
            bearing = bearingTrue
            bearingTrack = bearingTrackTrue
          }
          else
          {
            bearingReference = 1
            bearing = bearingMagnetic
            bearingTrack = bearingTrackMagnetic
          }
          if (sourcedata != "Course API v2")
            calcMethod = sourcedata == "Great Circle" ? 0 : 1;

          return [{
            pgn: 129284,
            "prio": 1,
            "SID" : 0x88,
            "Distance to Waypoint" :  Math.round(distance),
            "Course/Bearing reference" : bearingReference,
            "Perpendicular Crossed" : perpendicularPassed != null,
            "Arrival Circle Entered" : arrivalCircleEntered != null,
            "Calculation Type" : calcMethod == "GreatCircle" ? 0 : 1,
            "ETA Time" : (velocityMadeGood > 0) ? etaTime : undefined,
            "ETA Date": (velocityMadeGood > 0) ? etaDate : undefined,
            "Bearing, Origin to Destination Waypoint" : bearingTrack,
            "Bearing, Position to Destination Waypoint" : bearing,
            "Origin Waypoint Number" : undefined,
            "Destination Waypoint Number" : course.activeRoute?.pointIndex,
            "Destination Latitude" : course.nextPoint.position.latitude,
            "Destination Longitude" : course.nextPoint.position.longitude,
            "Waypoint Closing Velocity" : velocityMadeGood,
          }]
        },
        tests: [{
          input: [
            mockApp,
            112,
            5.3448232366812265, null,
            5.372817635792152, null,
            0.02995584805252791,
            "GreatCircle",
            null,
            null
          ],
          expected: [{
            "__preprocess__": (testResult) => {
              //these change every time
              delete testResult.fields["ETA Date"]
              delete testResult.fields["ETA Time"]
            },
            "prio": 1,
            "pgn": 129284,
            "dst": 255,
            "fields": {
              "SID": 136,
              "Distance to Waypoint": 112,
              "Course/Bearing reference": "True",
              "Perpendicular Crossed": "No",
              "Arrival Circle Entered": "No",
              "Calculation Type": "Great Circle",
              "Bearing, Origin to Destination Waypoint": 5.3728,
              "Bearing, Position to Destination Waypoint": 5.3448,
              "Destination Waypoint Number": 0,
              "Destination Latitude": 26.517348,
              "Destination Longitude": -78.635903,
              "Waypoint Closing Velocity": 0.03
            }
          }]
        },{
          input: [
            mockApp,
            112,
            null, 5.3448232366812265,
            null, 5.372817635792152,
            0.02995584805252791,
            "Rhumbline",
            null, null
          ],
          expected: [{
            "__preprocess__": (testResult) => {
              //these change every time
              delete testResult.fields["ETA Date"]
              delete testResult.fields["ETA Time"]
            },
            "prio": 1,
            "pgn": 129284,
            "dst": 255,
            "fields": {
              "SID": 136,
              "Distance to Waypoint": 112,
              "Course/Bearing reference": "Magnetic",
              "Perpendicular Crossed": "No",
              "Arrival Circle Entered": "No",
              "Calculation Type": "Rhumbline",
              "Bearing, Origin to Destination Waypoint": 5.3728,
              "Bearing, Position to Destination Waypoint": 5.3448,
              "Destination Waypoint Number": 0,
              "Destination Latitude": 26.517348,
              "Destination Longitude": -78.635903,
              "Waypoint Closing Velocity": 0.03
            }
          }]
        }]
      }]
    }
  }]
}

mockApp = {
  courseApi: {
    getCourse: () => {
      return {
        nextPoint: {
          position: {
            longitude: -80.047748,
            latitude: 26.747961,
          },
          type: "Location"
        },
        activeRoute: {
          href: '',
          pointIndex: 0,
          pointTotal: 12
        }
      }
    }
  },
  resourcesApi: {
    getResource: () => {
      return {
        name: 'West Palm Beach To Lucaya',
        description: 'Your route',
        feature: {
          type: 'Feature',
          properties: {
            _gpxType: 'rte',
            name: 'West Palm Beach To Lucaya',
            cmt: 'redID',
            desc: 'Your route'
          },
          geometry: {
            type: 'LineString',
            coordinates: [
              [ -80.047748, 26.747961 ],
              [ -80.049322, 26.768562 ],
              [ -80.037314, 26.772696 ],
              [ -80.023545, 26.771407 ],
              [ -78.7087, 26.476476 ],
              [ -78.62181, 26.486673 ],
              [ -78.62966, 26.49787 ],
              [ -78.634808, 26.511982 ],
              [ -78.636158, 26.514194 ],
              [ -78.637737, 26.515296 ],
              [ -78.637866, 26.516417 ],
              [ -78.635903, 26.517348 ],
            ]
          }
        }
      }
    }
  }
}

