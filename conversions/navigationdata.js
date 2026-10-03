const path = require('node:path');
const _ = require('lodash')

const routeWPDataItemsPerPacket = 3

// A course notification counts while it is raised; the course provider clears
// it by setting the value to null.
const isRaised = (notification) => notification != null && notification.state !== 'normal'

// The route or single destination of the active course as 129285 messages,
// null without one
async function routeWPInformation(app) {
  var course = await app.courseApi.getCourse()
  if (!course?.nextPoint?.position)
    return null
  if (!course.activeRoute?.href) {
    // A single destination goes out as a two-point route, from where
    // the course started to the destination.
    const origin = course.previousPoint?.position
    const dest = course.nextPoint.position
    return [{
      pgn: 129285,
      "prio": 7,
      "nItems": origin ? 2 : 1,
      "Database ID": 0,
      "Supplementary Route/WP data available": "Off",
      "Navigation direction in route": "Forward",
      "list": [
        ...(origin ? [{ "WP Latitude": origin.latitude, "WP Longitude": origin.longitude }] : []),
        {
          "WP ID": 1,
          "WP Name": course.nextPoint.name || "Waypoint 1",
          "WP Latitude": dest.latitude,
          "WP Longitude": dest.longitude
        }
      ]
    }]
  }

  const { href, name, reverse } = course.activeRoute
  const route = await app.resourcesApi.getResource('routes', path.basename(href))
  if (!route)
    return null
  // The course can change while the route is read; a route that is no longer
  // the active one is not sent.
  const activeRoute = (await app.courseApi.getCourse())?.activeRoute
  if (activeRoute?.href !== href || activeRoute.name !== name ||
      Boolean(activeRoute.reverse) !== Boolean(reverse))
    return null

  const coordinates = _.chunk(route.feature.geometry.coordinates, routeWPDataItemsPerPacket)
  return coordinates.map((coords, i) => {
    const list = coords.map((coord, j) => {
      // Numbered from 1, as 129284's Destination Waypoint Number is
      const waypointId = (routeWPDataItemsPerPacket * i) + j + 1
      return {
        "WP ID": waypointId,
        "WP Name": "Waypoint " + waypointId.toString(),
        // GeoJSON coordinates are [longitude, latitude]
        "WP Latitude": coord[1],
        "WP Longitude": coord[0]
      }
    })

    return {
      pgn: 129285,
      "prio": 7,
      "Start RPS#" : routeWPDataItemsPerPacket * i,
      "nItems" : coords.length,
      "Database ID" :  0,
      "Route ID" :  0,
      "Supplementary Route/WP data available" :  "Off",
      "Reserved": "00",
      "Route Name": name,
      "list": list,
      "Navigation direction in route" : reverse ? "Reverse" : "Forward",
    }
  })
}

module.exports = (app, plugin) => {
  return [{
    pgn: 127258,
    title: 'Magnetic Variation (127258)',
    optionKey: 'magneticvariation',
    keys: [
      'navigation.magneticVariation',
      'navigation.magneticVariation.source'
    ],
    callback: (variation, source) => {
      if (variation === null || variation === undefined) {
        return [];
      }

      // Age of Service = now (days since Jan 1, 1970)
      const ageOfServiceDays = Math.floor(Date.now() / 86400000);

      // Format source from "WMM-2025" to "WMM 2025"
      const formattedSource = source ? source.replace('-', ' ') : "Manual";

      return [{
        pgn: 127258,
        SID: 0xff,
        Source: formattedSource,
        ageOfService: ageOfServiceDays,
        Variation: variation
      }];
    },
    tests: [{
      input: [ 0.2146, "WMM-2020" ],
      expected: [{
        "__preprocess__": (testResult) => {
          // Age of service changes every day
          delete testResult.fields["Age of service"]
        },
        "prio": 2,
        "pgn": 127258,
        "dst": 255,
        "fields": {
          "Source": "WMM 2020",
          "Variation": 0.2146
        }
      }]
    }]
  },
  {
    pgn: 129283,
    title: 'Cross Track Error (129283)',
    optionKey: 'xte',
    keys: [
      'navigation.course.calcValues.crossTrackError'
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
      'navigation.course.calcValues.distance',
      'navigation.course.calcValues.bearingTrue',
      'navigation.course.calcValues.bearingTrackTrue',
      'navigation.course.nextPoint',
      'navigation.course.calcValues.velocityMadeGood',
      'navigation.course.calcValues.calcMethod',
      'notifications.navigation.course.arrivalCircleEntered',
      'notifications.navigation.course.perpendicularPassed',
      'navigation.course.activeRoute'
    ],
    // nextPoint is sent when the destination is set or changed, not
    // repeatedly, so it must not time out like the calculated values.
    timeouts: [
      10000, 10000, 10000, undefined, 10000, undefined, undefined, undefined, undefined
    ],
    callback: (distToDest, bearingToDest, bearingOriginToDest, destPos, WCV, calcMethod, ace, pp, rte) => {
      var dateObj = new Date();
      var secondsToGo = Math.trunc(distToDest / WCV);
      var etaDate = Math.trunc((dateObj.getTime() / 1000 + secondsToGo) / 86400);
      var etaTime = (dateObj.getUTCHours() * (60 * 60) +
                     dateObj.getUTCMinutes() * 60 +
                     dateObj.getUTCSeconds() +
                     secondsToGo) % 86400;
      // A single destination is waypoint 1 of the two-point route sent in 129285
      let wpid = rte && typeof rte?.pointIndex === 'number' ? rte.pointIndex + 1 : 1;
      return [{
        pgn: 129284,
        "SID" : 0x88,
        "Distance to Waypoint" :  distToDest,
        "Course/Bearing reference" : 0,
        "Perpendicular Crossed" : isRaised(pp) ? "Yes" : "No",
        "Arrival Circle Entered" : isRaised(ace) ? "Yes" : "No",
        "Calculation Type" : calcMethod == "GreatCircle" ? 0 : 1,
        "ETA Time" : (WCV > 0) ? etaTime : undefined,
        "ETA Date": (WCV > 0) ? etaDate : undefined,
        "Bearing, Origin to Destination Waypoint" : bearingOriginToDest,
        "Bearing, Position to Destination Waypoint" : bearingToDest,
        "Origin Waypoint Number" : undefined,
        "Destination Waypoint Number" : parseInt(wpid),
        "Destination Latitude" : destPos?.position?.latitude,
        "Destination Longitude" : destPos?.position?.longitude,
        "Waypoint Closing Velocity" : WCV,
      }]
    },
    tests: [{
      input: [ 12, 1.23, 3.1, {position: { longitude: -75.487264, latitude: 32.0631296 }} , 4.0, "Rhumbline", null, {state: "alert", method: ["visual"], message: "Perpendicular passed"}, {pointIndex: 5} ],
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
          "Destination Waypoint Number": 6,
          "Destination Latitude": 32.0631296,
          "Destination Longitude": -75.487264,
          "Waypoint Closing Velocity": 4
        }
      }]
    }, {
      input: [ 80, 1.23, 3.1, {position: { longitude: -75.487264, latitude: 32.0631296 }} , 4.0, "GreatCircle", {state: "alert", method: ["visual"], message: "Entered arrival zone"}, {state: "normal", method: [], message: ""}, {pointIndex: 0} ],
      expected: [{
        "__preprocess__": (testResult) => {
          delete testResult.fields["ETA Date"]
          delete testResult.fields["ETA Time"]
        },
        "prio": 2,
        "pgn": 129284,
        "dst": 255,
        "fields": {
          "SID": 136,
          "Distance to Waypoint": 80,
          "Course/Bearing reference": "True",
          "Perpendicular Crossed": "No",
          "Arrival Circle Entered": "Yes",
          "Calculation Type": "Great Circle",
          "Bearing, Origin to Destination Waypoint": 3.1,
          "Bearing, Position to Destination Waypoint": 1.23,
          "Destination Waypoint Number": 1,
          "Destination Latitude": 32.0631296,
          "Destination Longitude": -75.487264,
          "Waypoint Closing Velocity": 4
        }
      }]
    }, {
      // single destination, no route
      input: [ 500, 1.23, 1.25, {position: { longitude: -75.487264, latitude: 32.0631296 }} , 0, "GreatCircle", null, null, null ],
      expected: [{
        "prio": 2,
        "pgn": 129284,
        "dst": 255,
        "fields": {
          "SID": 136,
          "Distance to Waypoint": 500,
          "Course/Bearing reference": "True",
          "Perpendicular Crossed": "No",
          "Arrival Circle Entered": "No",
          "Calculation Type": "Great Circle",
          "Bearing, Origin to Destination Waypoint": 1.25,
          "Bearing, Position to Destination Waypoint": 1.23,
          "Destination Waypoint Number": 1,
          "Destination Latitude": 32.0631296,
          "Destination Longitude": -75.487264,
          "Waypoint Closing Velocity": 0
        }
      }]
    }]
  },
  {
    title: 'Route/WP Information (129285)',
    optionKey: 'routewpinformation',
    conversions: (options) => {
      let lastCourse
      return [{
        interval: 2000,
        sourceType: 'timer',
        callback: routeWPInformation,
        tests: [{
          input: [
            mockApp,
          ],
          expected: [{
            "prio": 7,
            "pgn": 129285,
            "dst": 255,
            "fields": {
              "Start RPS#": 0,
              "nItems": 3,
              "Database ID": 0,
              "Route ID": 0,
              "Route Name": "Test Route",
              "Navigation direction in route": "Forward",
              "Supplementary Route/WP data available": "Off",
              "list": [
                {
                  "WP ID": 1,
                  "WP Latitude": 38.9749677,
                  "WP Longitude": -76.4818398,
                  "WP Name": "Waypoint 1",
                },
                {
                  "WP ID": 2,
                  "WP Latitude": 38.977234,
                  "WP Longitude": -76.4795366,
                  "WP Name": "Waypoint 2",
                },
                {
                  "WP ID": 3,
                  "WP Latitude": 38.9780512,
                  "WP Longitude": -76.4726708,
                  "WP Name": "Waypoint 3",
                },
              ]
            }
          },{
            "prio": 7,
            "pgn": 129285,
            "dst": 255,
            "fields": {
              "Start RPS#": 3,
              "nItems": 3,
              "Database ID": 0,
              "Route ID": 0,
              "Route Name": "Test Route",
              "Navigation direction in route": "Forward",
              "Supplementary Route/WP data available": "Off",
              "list": [
                {
                  "WP ID": 4,
                  "WP Latitude": 38.9749677,
                  "WP Longitude": -76.4818398,
                  "WP Name": "Waypoint 4",
                },
                {
                  "WP ID": 5,
                  "WP Latitude": 38.977234,
                  "WP Longitude": -76.4795366,
                  "WP Name": "Waypoint 5",
                },
                {
                  "WP ID": 6,
                  "WP Latitude": 38.9780512,
                  "WP Longitude": -76.4726708,
                  "WP Name": "Waypoint 6",
                },
              ]
            }
          }]
        }, {
          input: [
            mockGotoApp,
          ],
          expected: [{
            "prio": 7,
            "pgn": 129285,
            "dst": 255,
            "fields": {
              "nItems": 2,
              "Database ID": 0,
              "Navigation direction in route": "Forward",
              "Supplementary Route/WP data available": "Off",
              "list": [
                {
                  "WP Latitude": 38.9749677,
                  "WP Longitude": -76.4818398,
                },
                {
                  "WP ID": 1,
                  "WP Name": "DP",
                  "WP Latitude": 38.9780512,
                  "WP Longitude": -76.4726708,
                },
              ]
            }
          }]
        }, {
          // another route activated while the route is read
          input: [
            mockRouteChangedApp,
          ],
          expected: []
        }]
      }, {
        // Also sent as soon as the course changes, so that a device told to
        // follow it has its waypoints without waiting for the timer.
        keys: [
          'navigation.course.activeRoute',
          'navigation.course.nextPoint',
          'navigation.course.previousPoint'
        ],
        callback: (activeRoute, nextPoint, previousPoint) => {
          const course = [activeRoute, nextPoint, previousPoint]
          if (_.isEqual(course, lastCourse))
            return null
          lastCourse = course
          return nextPoint ? routeWPInformation(app) : null
        },
        tests: [{
          // no course
          input: [null, null, null],
          expected: []
        }]
      }]
    }
  }]
}

var mockApp = {
  courseApi: {
    getCourse: () => {
      return {
        nextPoint: {
          "type": "RoutePoint",
          "position": {
            "latitude": 38.97496773616132,
            "longitude": -76.48183979803126
          }
        },
        activeRoute: {
          "href": "mock",
          "name": "Test Route",
          "reverse": false,
          "pointIndex": 0,
          "pointTotal": 6
        }
      }
    }
  },
  resourcesApi: {
    getResource: () => {
      return {
        "name": "Test Route",
        "description": "",
        "distance": 211170,
        "feature": {
          "type": "Feature",
          "geometry": {
            "type": "LineString",
            "coordinates": [
              [
                -76.48183979803126,
                38.97496773616132
              ],
              [
                -76.4795366274497,
                38.97723402732939
              ],
              [
                -76.47267084780538,
                38.97805124659462
              ],
              [
                -76.48183979803126,
                38.97496773616132
              ],
              [
                -76.4795366274497,
                38.97723402732939
              ],
              [
                -76.47267084780538,
                38.97805124659462
              ],
            ]
          },
          "properties": {},
          "id": ""
        }
      }
    }
  }
}

var mockGotoApp = {
  courseApi: {
    getCourse: () => {
      return {
        activeRoute: null,
        previousPoint: {
          "type": "VesselPosition",
          "position": {
            "latitude": 38.97496773616132,
            "longitude": -76.48183979803126
          }
        },
        nextPoint: {
          "type": "Location",
          "name": "DP",
          "position": {
            "latitude": 38.97805124659462,
            "longitude": -76.47267084780538
          }
        }
      }
    }
  }
}

// Activates another route while the route resource is read
var mockRouteChangedApp = (() => {
  let course = mockApp.courseApi.getCourse()
  return {
    courseApi: {
      getCourse: () => course
    },
    resourcesApi: {
      getResource: async (...args) => {
        course = {
          ...course,
          activeRoute: { ...course.activeRoute, href: course.activeRoute.href + '-next' }
        }
        return mockApp.resourcesApi.getResource(...args)
      }
    }
  }
})()
