const path = require('node:path');
const _ = require('lodash')

const routeWPDataItemsPerPacket = 3

module.exports = (app, plugin) => {
  return [{
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
      'notifications.navigation.arrivalCircleEntered',
      'notifications.navigation.perpendicularPassed',
      'navigation.course.activeRoute'
    ],
    timeouts: [
      10000, 10000, 10000, 10000, 10000, undefined, 1000, 1000, undefined
    ],
    callback: (distToDest, bearingToDest, bearingOriginToDest, destPos, WCV, calcMethod, ace, pp, rte) => {
      var dateObj = new Date();
      var secondsToGo = Math.trunc(distToDest / WCV);
      var etaDate = Math.trunc((dateObj.getTime() / 1000 + secondsToGo) / 86400);
      var etaTime = (dateObj.getUTCHours() * (60 * 60) +
                     dateObj.getUTCMinutes() * 60 +
                     dateObj.getUTCSeconds() +
                     secondsToGo) % 86400;
      let wpid = rte && typeof rte?.pointIndex === 'number' ? rte.pointIndex + 1 : 0;
      return [{
        pgn: 129284,
        "SID" : 0x88,
        "Distance to Waypoint" :  distToDest,
        "Course/Bearing reference" : 0,
        "Perpendicular Crossed" : pp != null,
        "Arrival Circle Entered" : ace != null,
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
      input: [ 12, 1.23, 3.1, {position: { longitude: -75.487264, latitude: 32.0631296 }} , 4.0, "Rhumbline", null, 1, {pointIndex: 5} ],
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
    }]
  },
  {
    title: 'Route/WP Information (129285)',
    optionKey: 'routewpinformation',
    conversions: (options) => {
      return [{
        interval: 10000,
        sourceType: 'timer',
        callback: async (app) => {
          var course = await app.courseApi.getCourse()
          if (!course.activeRoute?.href)
            return null

          route = await app.resourcesApi.getResource('routes', path.basename(course.activeRoute.href))
          if (!route)
            return null

          coordinates = _.chunk(route.feature.geometry.coordinates, routeWPDataItemsPerPacket)
          return coordinates.map((coords, i) => {
            list = coords.map((coord, j) => {
              waypointId = (routeWPDataItemsPerPacket * i) + j
              return {
                "WP ID": waypointId,
                "WP Name": "Waypoint " + (waypointId + 1).toString(),
                "WP Latitude": coord[1],
                "WP Longitude": coord[0]
              }
            })

            return {
              pgn: 129285,
              "prio": 7,
              "Start RPS#" : i,
              "nItems" : coords.length,
              "Database ID" :  0,
              "Route ID" :  0,
              "Supplementary Route/WP data available" :  "Off",
              "Reserved": "00",
              "Route Name": course.activeRoute.name,
              "list": list,
              "Navigation direction in route" : course.activeRoute.reverse ? "Reverse" : "Forward",
            }
          })
        },
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
                  "WP ID": 0,
                  "WP Latitude": 38.9749677,
                  "WP Longitude": -76.4818398,
                  "WP Name": "Waypoint 1",
                },
                {
                  "WP ID": 1,
                  "WP Latitude": 38.977234,
                  "WP Longitude": -76.4795366,
                  "WP Name": "Waypoint 2",
                },
                {
                  "WP ID": 2,
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
              "Start RPS#": 1,
              "nItems": 3,
              "Database ID": 0,
              "Route ID": 0,
              "Route Name": "Test Route",
              "Navigation direction in route": "Forward",
              "Supplementary Route/WP data available": "Off",
              "list": [
                {
                  "WP ID": 3,
                  "WP Latitude": 38.9749677,
                  "WP Longitude": -76.4818398,
                  "WP Name": "Waypoint 4",
                },
                {
                  "WP ID": 4,
                  "WP Latitude": 38.977234,
                  "WP Longitude": -76.4795366,
                  "WP Name": "Waypoint 5",
                },
                {
                  "WP ID": 5,
                  "WP Latitude": 38.9780512,
                  "WP Longitude": -76.4726708,
                  "WP Name": "Waypoint 6",
                },
              ]
            }
          }]
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
