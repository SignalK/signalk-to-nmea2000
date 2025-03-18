const path = require('node:path');
const geolib= require('geolib');
const _ = require('lodash')

module.exports = (app, plugin) => {
  return [{
    title: 'Raymarine Route and Waypoint Information (130848, 130918)',
    optionKey: 'RAYMARINENAV',
    conversions: (options) => {
      return [{
        pgn: 130848,
        keys: [
          'navigation.course.calcValues.distance',
          'navigation.course.calcValues.bearingTrue',
          'navigation.course.calcValues.bearingMagnetic',
          'navigation.course.activeRoute',
        ],
        sourceType: 'timer',
        interval: 1000,
        callback: async (app, distance, bearingTrue, bearingMagnetic) => {
          course = await app.courseApi.getCourse()
          if (course.nextPoint == null)
            return null

          let waypointId = course.activeRoute && 
			typeof course.activeRoute?.pointIndex === 'number' ? 
			  course.activeRoute?.pointIndex + 1 : 0;
          return [{
            pgn: 130848,
            "dst": 255,
            "Manufacturer Code": "Raymarine",
            "Industry Code": "Marine Industry",
            "SID": 0x88,
            "Waypoint Name": "Waypoint " + waypointId.toString(),
            "Waypoint Sequence": waypointId.toString().padStart(4, '0'),
            "Bearing to Waypoint, True": bearingTrue,
            "Bearing to Waypoint, Magnetic": bearingMagnetic,
            "Distance to Waypoint": distance
          }]
        },
        tests: [{
          input: [ mockApp, 1915751, 0.1885, 0.3392, { pointIndex: 0, pointTotal: 6 } ],
          expected: [{
            "prio": 2,
            "pgn": 130848,
            "dst": 255,
            "fields": {
              "Industry Code": "Marine Industry",
              "Manufacturer Code": "Raymarine",
              "SID": 0x88,
              "Waypoint Name": "Waypoint 1",
              "Waypoint Sequence": "0001",
              "Bearing to Waypoint, True": 0.1885,
              "Bearing to Waypoint, Magnetic": 0.3392,
              "Distance to Waypoint": 1915751
            }
          }]
        }]
      },
      {
        pgn: 130918,
        keys: [
          'navigation.position',
          'navigation.course.calcValues.distance',
          'navigation.course.calcValues.bearingTrue',
        ],
        sourceType: 'timer',
        interval: 1000,
        callback: async (app, position, distance, bearingTrue) => {
          course = await app.courseApi.getCourse()
          if (course.nextPoint == null)
            return null

          let nextWaypointId = 255
          let nextWaypointName = undefined
          let unknownFlags = 0
          let bearingCurrentToNext = undefined
          let bearingPositionToNext = undefined
          let distancePositionToNext = undefined

          if (course.activeRoute == null)
          {
            currentWaypointId = 1
            currentWaypointName = "Destination"
          } else {
            currentWaypointId = course.activeRoute.pointIndex + 1
            currentWaypointName = "Waypoint " + currentWaypointId.toString()
          }

          if (course.activeRoute == null || course.activeRoute.pointIndex + 1 == course.activeRoute.pointTotal)
          {
            unknownFlags = 13
            distancePositionToNext = distance
            bearingPositionToNext = bearingTrue
          } else {
            route = await app.resourcesApi.getResource('routes', path.basename(course.activeRoute.href))
            if (course.activeRoute.pointIndex + 2 == course.activeRoute.pointTotal)
              unknownFlags = 4

            nextWaypointId = currentWaypointId + 1
            nextWaypointName = "Waypoint " + nextWaypointId.toString()
            nextWaypointLatLng = route.feature.geometry.coordinates[course.activeRoute.pointIndex + 1]

            bearingPositionToNext = toRadians(
              geolib.getGreatCircleBearing(position, nextWaypointLatLng)
            )
            distancePositionToNext = geolib.getPreciseDistance(position, nextWaypointLatLng)

            currentWaypointLatLng = route.feature.geometry.coordinates[course.activeRoute.pointIndex]
            bearingCurrentToNext = toRadians(
              geolib.getGreatCircleBearing(currentWaypointLatLng, nextWaypointLatLng)
            )
          }
          return [{
            pgn: 130918,
            "dst": 255,
            "Manufacturer Code": "Raymarine",
            "Industry Code": "Marine Industry",
            "Current Waypoint Name": currentWaypointName,
            "Current Waypoint Sequence": currentWaypointId,
            "Next Waypoint Sequence": nextWaypointId,
            "Next Waypoint Name": nextWaypointName,
            "Unknown": unknownFlags,
            'Bearing, Current Waypoint to Next Waypoint, True': bearingCurrentToNext,
            'Bearing, Position to Next Waypoint, True': bearingPositionToNext,
            'Distance, Position to Next Waypoint': distancePositionToNext,
          }]
        },
        tests: [{
          input: [
            mockApp,
            { "longitude": -78.6349923366475, "latitude": 26.51859369671446 },
            20,
            120,
          ],
          expected: [{
            "prio": 2,
            "pgn": 130918,
            "dst": 255,
            "fields": {
              "Industry Code": "Marine Industry",
              "Manufacturer Code": "Raymarine",
              "Current Waypoint Name": "Waypoint 1",
              "Current Waypoint Sequence": 1,
              "Next Waypoint Name":"Waypoint 2",
              "Next Waypoint Sequence": 2,
              "Unknown": 0,
              "Bearing, Current Waypoint to Next Waypoint, True": 4.225,
              "Bearing, Position to Next Waypoint, True": 4.0099,
              "Distance, Position to Next Waypoint": 374,
            }
          }]
        }]
      }]
    }
  }]
}

function toRadians(value) {
    return (value * Math.PI) / 180;
}

var mockApp = {
  courseApi: {
    getCourse: () => {
      return {
        nextPoint: {
          position: {
            longitude: -78.635903,
            latitude: 26.517348
          },
          type: "Location"
        },
        activeRoute: {
          href: 'mock',
          pointIndex: 0,
          pointTotal: 12
        }
      }
    }
  },
  resourcesApi: {
    getResource: () => {
      return {
        name: 'Lucaya To West Palm Beach',
        description: 'Your route',
        feature: {
          type: 'Feature',
          properties: {
            _gpxType: 'rte',
            name: 'Lucaya To West Palm Beach',
            cmt: 'redID',
            desc: 'Your route'
          },
          geometry: {
            type: 'LineString',
            coordinates: [
              [ -78.635903, 26.517348 ],
              [ -78.637866, 26.516417 ],
              [ -78.637737, 26.515296 ],
              [ -78.636158, 26.514194 ],
              [ -78.634808, 26.511982 ],
              [ -78.62966, 26.49787 ],
              [ -78.62181, 26.486673 ],
              [ -78.7087, 26.476476 ],
              [ -80.023545, 26.771407 ],
              [ -80.037314, 26.772696 ],
              [ -80.049322, 26.768562 ],
              [ -80.047748, 26.747961 ],
            ]
          }
        }
      }
    }
  }
}

