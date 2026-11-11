import path from 'path'
import _ from 'lodash'
import {
  PGN_127258,
  PGN_129283,
  PGN_129284,
  PGN_129285,
  Direction,
  OffOn,
  YesNo,
  ResidualMode,
  MagneticVariation
} from '@canboat/ts-pgns'
import type { PluginOptions } from '../schema'
import { App, Plugin, Conversion } from '../types'
import { withPriority } from '../pgn'
import { routeId } from '../routeId'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { courseOrigin } = require('../nmea2000Source')

const routeWPDataItemsPerPacket = 3

// A course notification counts while it is raised; the course provider clears
// it by setting the value to null.
const isRaised = (notification: any): boolean =>
  notification != null && notification.state !== 'normal'

// The course change path sends 129285 at most this often, whatever produces
// the changes; the timer sends a course held back by it.
const routeWPOnChangeMinInterval = 1000

// Likewise for 129284, so that a burst of course changes cannot flood the bus.
const navigationDataOnChangeMinInterval = 1000

// The calculated values stop being meaningful a while after they were last
// updated. The server's meta.timeout staleness handling is off by default, so
// the timer has to expire them itself rather than repeat a stale value.
const navigationDataCalcValueTimeout = 10000

// The leaf's timestamp in milliseconds, whether the tree stores it as a number
// or as the ISO string a delta carries.
function leafTimestamp(update: any): number | undefined {
  if (typeof update.timestamp === 'number') return update.timestamp
  if (typeof update.timestamp === 'string') {
    const parsed = Date.parse(update.timestamp)
    if (!Number.isNaN(parsed)) return parsed
  }
  return undefined
}

// A value from a Signal K tree node, or undefined once it is stale.
function freshValue(node: any, timeout?: number): any {
  if (node == null) return undefined
  if (!(node instanceof Object) || !('value' in node)) return node
  const timestamp = leafTimestamp(node)
  if (timeout != null && timestamp != null && timestamp + timeout <= Date.now())
    return undefined
  return node.value
}

// The route or single destination of the active course as 129285 messages,
// null without one
async function routeWPInformation(app: App): Promise<PGN_129285[] | null> {
  var course = await app.courseApi.getCourse()
  if (!course?.nextPoint?.position) return null
  if (!course.activeRoute?.href) {
    // A single destination goes out as waypoint 1; the course's previous
    // point, when there is one, precedes it as the origin.
    const origin = course.previousPoint?.position
    const dest = course.nextPoint.position
    return [
      withPriority(
        new PGN_129285({
          nitems: origin ? 2 : 1,
          databaseId: 0,
          routeId: routeId(undefined, dest),
          supplementaryRouteWpDataAvailable: OffOn.Off,
          navigationDirectionInRoute: Direction.Forward,
          list: [
            ...(origin
              ? [{ wpLatitude: origin.latitude, wpLongitude: origin.longitude }]
              : []),
            {
              wpId: 1,
              wpName: course.nextPoint.name || 'Waypoint 1',
              wpLatitude: dest.latitude,
              wpLongitude: dest.longitude
            }
          ]
        }),
        7
      )
    ]
  }

  const { href, name, reverse } = course.activeRoute
  // A route resource can be missing or unreadable; without its coordinates
  // there is no route to send.
  let route: any
  try {
    route = await app.resourcesApi.getResource('routes', path.basename(href))
  } catch {
    return null
  }
  const routeCoordinates = route?.feature?.geometry?.coordinates
  if (!Array.isArray(routeCoordinates)) return null
  // The course can change while the route is read; a route that is no longer
  // the active one is not sent.
  const activeRoute = (await app.courseApi.getCourse())?.activeRoute
  if (
    activeRoute?.href !== href ||
    activeRoute.name !== name ||
    Boolean(activeRoute.reverse) !== Boolean(reverse)
  )
    return null

  // In the order the route is sailed, as 129284 numbers its destination
  // (the Course API's pointIndex counts in that order) and as 130067 lists it
  const sailed = reverse ? [...routeCoordinates].reverse() : routeCoordinates
  const coordinates = _.chunk(sailed, routeWPDataItemsPerPacket)
  return coordinates.map((coords: number[][], i: number) => {
    const list = coords.map((coord: number[], j: number) => {
      // Numbered from 1, as 129284's Destination Waypoint Number is
      const waypointId = routeWPDataItemsPerPacket * i + j + 1
      return {
        wpId: waypointId,
        wpName: 'Waypoint ' + waypointId.toString(),
        // GeoJSON coordinates are [longitude, latitude]
        wpLatitude: coord[1],
        wpLongitude: coord[0]
      }
    })

    return withPriority(
      new PGN_129285({
        startRps: routeWPDataItemsPerPacket * i,
        nitems: coords.length,
        databaseId: 0,
        routeId: routeId(course.activeRoute),
        supplementaryRouteWpDataAvailable: OffOn.Off,
        // The reserved bits are left to the encoder, which writes them as all
        // ones.
        routeName: name,
        list: list,
        // Listed as sailed, so forward whether the route is reversed or not
        navigationDirectionInRoute: Direction.Forward
      }),
      7
    )
  })
}

// An incrementing SID so that a receiver can tell one 129284 from the next.
let sid129284 = 0

// Navigation data of the active course as a 129284 message, or null without an
// active destination. The destination comes from the Course API and the
// calculated values from the Signal K tree, so that the same data can be sent
// by the timer and by a course change.
async function navigationData(app: App): Promise<PGN_129284[] | null> {
  const course = await app.courseApi.getCourse()
  // The Course API returns an object even when no course is active; without a
  // destination there is no navigation data to send.
  if (!course?.nextPoint?.position) return null

  // The calculated values and the course notifications are each read as one
  // subtree, rather than a call per path. A calculated value that has stopped
  // updating is dropped: the server's meta.timeout handling is off by default,
  // so its age is checked here.
  const calcValues = app.getSelfPath('navigation.course.calcValues') || {}
  const distance = freshValue(
    calcValues.distance,
    navigationDataCalcValueTimeout
  )
  if (distance == null) return null

  const bearingToDest = freshValue(
    calcValues.bearingTrue,
    navigationDataCalcValueTimeout
  )
  const bearingOriginToDest = freshValue(
    calcValues.bearingTrackTrue,
    navigationDataCalcValueTimeout
  )
  const WCV = freshValue(
    calcValues.velocityMadeGood,
    navigationDataCalcValueTimeout
  )
  const calcMethod = freshValue(
    calcValues.calcMethod,
    navigationDataCalcValueTimeout
  )
  // A course notification counts while it is raised; the provider clears it.
  const courseNotifications =
    app.getSelfPath('notifications.navigation.course') || {}
  const ace = courseNotifications.arrivalCircleEntered?.value
  const pp = courseNotifications.perpendicularPassed?.value

  const dateObj = new Date()
  const secondsToGo = Math.trunc(distance / WCV)
  const etaDate = Math.trunc((dateObj.getTime() / 1000 + secondsToGo) / 86400)
  const etaTime =
    (dateObj.getUTCHours() * (60 * 60) +
      dateObj.getUTCMinutes() * 60 +
      dateObj.getUTCSeconds() +
      secondsToGo) %
    86400

  // A single destination is waypoint 1 of the two-point route sent in 129285
  const waypointId =
    course.activeRoute && typeof course.activeRoute.pointIndex === 'number'
      ? course.activeRoute.pointIndex + 1
      : 1

  sid129284 = sid129284 == 252 ? 0 : sid129284 + 1

  return [
    new PGN_129284({
      sid: sid129284,
      distanceToWaypoint: distance,
      courseBearingReference: 0,
      perpendicularCrossed: isRaised(pp) ? YesNo.Yes : YesNo.No,
      arrivalCircleEntered: isRaised(ace) ? YesNo.Yes : YesNo.No,
      calculationType:
        calcMethod == null ? undefined : calcMethod == 'GreatCircle' ? 0 : 1,
      etaTime: WCV > 0 ? etaTime : undefined,
      // Days since 1970, which the encoder takes for a date
      etaDate: WCV > 0 ? (etaDate as unknown as string) : undefined,
      bearingOriginToDestinationWaypoint: bearingOriginToDest,
      bearingPositionToDestinationWaypoint: bearingToDest,
      originWaypointNumber: undefined,
      destinationWaypointNumber: waypointId,
      destinationLatitude: course.nextPoint.position.latitude,
      destinationLongitude: course.nextPoint.position.longitude,
      waypointClosingVelocity: WCV
    })
  ]
}

module.exports = (app: App, plugin: Plugin): Conversion[] => {
  return [
    {
      pgn: 127258,
      title: 'Magnetic Variation (127258)',
      optionKey: 'magneticvariation',
      keys: [
        'navigation.magneticVariation',
        'navigation.magneticVariation.source'
      ],
      callback: (
        variation?: number | null,
        source?: string | null
      ): PGN_127258[] => {
        if (variation === null || variation === undefined) {
          return []
        }

        // Age of Service = now (days since Jan 1, 1970)
        const ageOfServiceDays = Math.floor(Date.now() / 86400000)

        // Format source from "WMM-2025" to "WMM 2025"
        const formattedSource = source ? source.replace('-', ' ') : 'Manual'

        return [
          new PGN_127258({
            // "WMM 2025" and the like, as MAGNETIC_VARIATION names them
            source: formattedSource as MagneticVariation,
            // Days since 1970, which the encoder takes for a date
            ageOfService: ageOfServiceDays as unknown as string,
            variation: variation
          })
        ]
      },
      tests: [
        {
          input: [0.2146, 'WMM-2020'],
          expected: [
            {
              __preprocess__: (testResult: any) => {
                // Age of service changes every day
                delete testResult.fields['Age of service']
              },
              prio: 7,
              pgn: 127258,
              dst: 255,
              fields: {
                Source: 'WMM 2020',
                Variation: 0.2146
              }
            }
          ]
        }
      ]
    },
    {
      pgn: 129283,
      title: 'Cross Track Error (129283)',
      optionKey: 'xte',
      keys: ['navigation.course.calcValues.crossTrackError'],
      conversions: (options: PluginOptions): Conversion[] => {
        // A source picked for the cross track error is sent whatever the course
        const origin = courseOrigin(
          app,
          options?.xte?.allowNmea2000Sources ||
            Boolean(options?.xte?.navigationcoursecalcValuescrossTrackError)
        )
        return [
          {
            keys: ['navigation.course.calcValues.crossTrackError'],
            withheld: origin.withheld,
            callback: (XTE: number): PGN_129283[] | null =>
              origin.withheld()
                ? null
                : [
                    new PGN_129283({
                      xte: XTE,
                      xteMode: ResidualMode.Autonomous,
                      navigationTerminated: YesNo.No
                    })
                  ],
            tests: [
              {
                input: [0.12],
                expected: [
                  {
                    prio: 3,
                    pgn: 129283,
                    dst: 255,
                    fields: {
                      'XTE mode': 'Autonomous',
                      'Navigation Terminated': 'No',
                      XTE: 0.12
                    }
                  }
                ]
              }
            ]
          },
          origin.conversion
        ]
      }
    },
    {
      pgn: 129284,
      title: 'Navigation Data (129284)',
      optionKey: 'navigationdata',
      conversions: (options: PluginOptions): Conversion[] => {
        let lastCourse: unknown
        let lastChangeSentAt = 0
        let inFlight = false
        const origin = courseOrigin(
          app,
          options?.navigationdata?.allowNmea2000Sources
        )

        // The timer and a course change both send through here. A course change
        // just before a timer tick must not put two 129284s on the bus in the
        // same second, so the timer waits after a change. A timer send never
        // delays a change, though: only course-change sends move the timestamp,
        // so a change is still immediate unless another change was just sent.
        async function sendNavigationData(
          app: App,
          onCourseChange: boolean
        ): Promise<PGN_129284[] | null> {
          if (origin.withheld()) return null
          // Reserve the slot before awaiting, so the timer and a course change
          // cannot both pass the check while the other's worker is pending.
          if (inFlight) return null
          const now = Date.now()
          if (now - lastChangeSentAt < navigationDataOnChangeMinInterval)
            return null
          inFlight = true
          try {
            const pgns = await navigationData(app)
            if (pgns != null && onCourseChange) lastChangeSentAt = Date.now()
            return pgns
          } finally {
            inFlight = false
          }
        }

        return [
          {
            // The values are read from the tree per tick and expired by age, so a
            // calculated value that has stopped updating is not sent forever.
            interval: 1000,
            sourceType: 'timer',
            callback: (app: App) => sendNavigationData(app, false),
            tests: [
              {
                // an active route
                input: [mockNavApp],
                expected: [
                  {
                    __preprocess__: (testResult: any) => {
                      // the SID increments on every message
                      delete testResult.fields['SID']
                      // these change every time
                      delete testResult.fields['ETA Date']
                      delete testResult.fields['ETA Time']
                    },
                    prio: 3,
                    pgn: 129284,
                    dst: 255,
                    fields: {
                      'Distance to Waypoint': 12,
                      'Course/Bearing reference': 'True',
                      'Perpendicular Crossed': 'Yes',
                      'Arrival Circle Entered': 'No',
                      'Calculation Type': 'Rhumbline',
                      'Bearing, Origin to Destination Waypoint': 3.1,
                      'Bearing, Position to Destination Waypoint': 1.23,
                      'Destination Waypoint Number': 6,
                      'Destination Latitude': 38.9749677,
                      'Destination Longitude': -76.4818398,
                      'Waypoint Closing Velocity': 4
                    }
                  }
                ]
              },
              {
                // great circle, arrival circle entered, perpendicular cleared
                input: [mockNavArrivalApp],
                expected: [
                  {
                    __preprocess__: (testResult: any) => {
                      delete testResult.fields['SID']
                      delete testResult.fields['ETA Date']
                      delete testResult.fields['ETA Time']
                    },
                    prio: 3,
                    pgn: 129284,
                    dst: 255,
                    fields: {
                      'Distance to Waypoint': 80,
                      'Course/Bearing reference': 'True',
                      'Perpendicular Crossed': 'No',
                      'Arrival Circle Entered': 'Yes',
                      'Calculation Type': 'Great Circle',
                      'Bearing, Origin to Destination Waypoint': 3.1,
                      'Bearing, Position to Destination Waypoint': 1.23,
                      'Destination Waypoint Number': 1,
                      'Destination Latitude': 38.9749677,
                      'Destination Longitude': -76.4818398,
                      'Waypoint Closing Velocity': 4
                    }
                  }
                ]
              },
              {
                // single destination, no route
                input: [mockNavGotoApp],
                expected: [
                  {
                    __preprocess__: (testResult: any) => {
                      delete testResult.fields['SID']
                    },
                    prio: 3,
                    pgn: 129284,
                    dst: 255,
                    fields: {
                      'Distance to Waypoint': 500,
                      'Course/Bearing reference': 'True',
                      'Perpendicular Crossed': 'No',
                      'Arrival Circle Entered': 'No',
                      'Calculation Type': 'Great Circle',
                      'Bearing, Origin to Destination Waypoint': 1.25,
                      'Bearing, Position to Destination Waypoint': 1.23,
                      'Destination Waypoint Number': 1,
                      'Destination Latitude': 32.0631296,
                      'Destination Longitude': -75.487264,
                      'Waypoint Closing Velocity': 0
                    }
                  }
                ]
              },
              {
                // no active course: nothing goes out
                input: [mockNavNoCourseApp],
                expected: []
              },
              {
                // no distance yet: nothing goes out
                input: [mockNavNoDistanceApp],
                expected: []
              },
              {
                // a distance that has stopped updating: nothing goes out
                input: [mockNavStaleDistanceApp],
                expected: []
              }
            ]
          },
          {
            // Also sent as soon as the course changes, so that a device told to
            // follow it has the new destination without waiting for the timer.
            keys: [
              'navigation.course.activeRoute',
              'navigation.course.nextPoint',
              'navigation.course.previousPoint'
            ],
            withheld: origin.withheld,
            callback: (
              activeRoute: unknown,
              nextPoint: unknown,
              previousPoint: unknown
            ) => {
              const course = [activeRoute, nextPoint, previousPoint]
              if (_.isEqual(course, lastCourse)) return null
              lastCourse = course
              if (!nextPoint) return null
              return sendNavigationData(app, true)
            },
            tests: [
              {
                // no course
                input: [null, null, null],
                expected: []
              }
            ]
          },
          origin.conversion
        ]
      }
    },
    {
      title: 'Route/WP Information (129285)',
      optionKey: 'routewpinformation',
      conversions: (options: PluginOptions): Conversion[] => {
        let lastCourse: unknown
        let lastSentOnChange = 0
        const origin = courseOrigin(
          app,
          options?.routewpinformation?.allowNmea2000Sources
        )
        return [
          {
            interval: 2000,
            sourceType: 'timer',
            callback: (app: App) =>
              origin.withheld() ? null : routeWPInformation(app),
            tests: [
              {
                input: [mockApp],
                expected: [
                  {
                    prio: 7,
                    pgn: 129285,
                    dst: 255,
                    fields: {
                      'Start RPS#': 0,
                      nItems: 3,
                      'Database ID': 0,
                      'Route ID': 255,
                      'Route Name': 'Test Route',
                      'Navigation direction in route': 'Forward',
                      'Supplementary Route/WP data available': 'Off',
                      list: [
                        {
                          'WP ID': 1,
                          'WP Latitude': 38.9749677,
                          'WP Longitude': -76.4818398,
                          'WP Name': 'Waypoint 1'
                        },
                        {
                          'WP ID': 2,
                          'WP Latitude': 38.977234,
                          'WP Longitude': -76.4795366,
                          'WP Name': 'Waypoint 2'
                        },
                        {
                          'WP ID': 3,
                          'WP Latitude': 38.9780512,
                          'WP Longitude': -76.4726708,
                          'WP Name': 'Waypoint 3'
                        }
                      ]
                    }
                  },
                  {
                    prio: 7,
                    pgn: 129285,
                    dst: 255,
                    fields: {
                      'Start RPS#': 3,
                      nItems: 3,
                      'Database ID': 0,
                      'Route ID': 255,
                      'Route Name': 'Test Route',
                      'Navigation direction in route': 'Forward',
                      'Supplementary Route/WP data available': 'Off',
                      list: [
                        {
                          'WP ID': 4,
                          'WP Latitude': 38.9749677,
                          'WP Longitude': -76.4818398,
                          'WP Name': 'Waypoint 4'
                        },
                        {
                          'WP ID': 5,
                          'WP Latitude': 38.977234,
                          'WP Longitude': -76.4795366,
                          'WP Name': 'Waypoint 5'
                        },
                        {
                          'WP ID': 6,
                          'WP Latitude': 38.9780512,
                          'WP Longitude': -76.4726708,
                          'WP Name': 'Waypoint 6'
                        }
                      ]
                    }
                  }
                ]
              },
              {
                input: [mockGotoApp],
                expected: [
                  {
                    prio: 7,
                    pgn: 129285,
                    dst: 255,
                    fields: {
                      nItems: 2,
                      'Database ID': 0,
                      'Route ID': 11749,
                      'Navigation direction in route': 'Forward',
                      'Supplementary Route/WP data available': 'Off',
                      list: [
                        {
                          'WP Latitude': 38.9749677,
                          'WP Longitude': -76.4818398
                        },
                        {
                          'WP ID': 1,
                          'WP Name': 'DP',
                          'WP Latitude': 38.9780512,
                          'WP Longitude': -76.4726708
                        }
                      ]
                    }
                  }
                ]
              },
              {
                // another route activated while the route is read
                input: [mockRouteChangedApp],
                expected: []
              }
            ]
          },
          {
            // Also sent as soon as the course changes, so that a device told to
            // follow it has its waypoints without waiting for the timer.
            keys: [
              'navigation.course.activeRoute',
              'navigation.course.nextPoint',
              'navigation.course.previousPoint'
            ],
            withheld: origin.withheld,
            callback: (
              activeRoute: unknown,
              nextPoint: unknown,
              previousPoint: unknown
            ) => {
              const course = [activeRoute, nextPoint, previousPoint]
              if (_.isEqual(course, lastCourse)) return null
              if (!nextPoint) {
                lastCourse = course
                return null
              }
              const now = Date.now()
              if (now - lastSentOnChange < routeWPOnChangeMinInterval)
                return null
              lastCourse = course
              lastSentOnChange = now
              return routeWPInformation(app)
            },
            tests: [
              {
                // no course
                input: [null, null, null],
                expected: []
              }
            ]
          },
          origin.conversion
        ]
      }
    }
  ]
}

var mockApp = {
  courseApi: {
    getCourse: () => {
      return {
        nextPoint: {
          type: 'RoutePoint',
          position: {
            latitude: 38.97496773616132,
            longitude: -76.48183979803126
          }
        },
        activeRoute: {
          href: 'mock',
          name: 'Test Route',
          reverse: false,
          pointIndex: 0,
          pointTotal: 6
        }
      }
    }
  },
  resourcesApi: {
    getResource: () => {
      return {
        name: 'Test Route',
        description: '',
        distance: 211170,
        feature: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [-76.48183979803126, 38.97496773616132],
              [-76.4795366274497, 38.97723402732939],
              [-76.47267084780538, 38.97805124659462],
              [-76.48183979803126, 38.97496773616132],
              [-76.4795366274497, 38.97723402732939],
              [-76.47267084780538, 38.97805124659462]
            ]
          },
          properties: {},
          id: ''
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
          type: 'VesselPosition',
          position: {
            latitude: 38.97496773616132,
            longitude: -76.48183979803126
          }
        },
        nextPoint: {
          type: 'Location',
          name: 'DP',
          position: {
            latitude: 38.97805124659462,
            longitude: -76.47267084780538
          }
        }
      }
    }
  }
}

// A route that is no longer active once read must not be sent: the Course
// API can change while the resource is read, more so now that a course
// change triggers the read at once
var mockRouteChangedApp = (() => {
  let course = mockApp.courseApi.getCourse()
  return {
    courseApi: {
      getCourse: () => course
    },
    resourcesApi: {
      getResource: async (...args: any[]) => {
        course = {
          ...course,
          activeRoute: {
            ...course.activeRoute,
            href: course.activeRoute.href + '-next'
          }
        }
        return (mockApp.resourcesApi.getResource as any)(...args)
      }
    }
  }
})()

// 129284 mocks: the destination comes from the Course API, the calculated
// values and notifications from the Signal K tree, as the worker reads them.
// The leaves are nested so that a subtree can be read in one getSelfPath call.
function mockNavSelf(values: Record<string, unknown>) {
  const tree = {}
  Object.entries(values).forEach(([key, value]) => {
    _.set(tree, key, { value })
  })
  return {
    getSelfPath: (key: string) => _.get(tree, key)
  }
}

var mockNavApp = {
  courseApi: {
    getCourse: async () => ({
      nextPoint: {
        type: 'RoutePoint',
        position: {
          latitude: 38.97496773616132,
          longitude: -76.48183979803126
        }
      },
      activeRoute: {
        href: 'mock',
        name: 'Test Route',
        reverse: false,
        pointIndex: 5,
        pointTotal: 6
      }
    })
  },
  ...mockNavSelf({
    'navigation.course.calcValues.distance': 12,
    'navigation.course.calcValues.bearingTrue': 1.23,
    'navigation.course.calcValues.bearingTrackTrue': 3.1,
    'navigation.course.calcValues.velocityMadeGood': 4.0,
    'navigation.course.calcValues.calcMethod': 'Rhumbline',
    'notifications.navigation.course.arrivalCircleEntered': null,
    'notifications.navigation.course.perpendicularPassed': {
      state: 'alert',
      method: ['visual'],
      message: 'Perpendicular passed'
    }
  })
}

var mockNavArrivalApp = {
  courseApi: {
    getCourse: async () => ({
      nextPoint: {
        type: 'RoutePoint',
        position: {
          latitude: 38.97496773616132,
          longitude: -76.48183979803126
        }
      },
      activeRoute: {
        href: 'mock',
        name: 'Test Route',
        reverse: false,
        pointIndex: 0,
        pointTotal: 6
      }
    })
  },
  ...mockNavSelf({
    'navigation.course.calcValues.distance': 80,
    'navigation.course.calcValues.bearingTrue': 1.23,
    'navigation.course.calcValues.bearingTrackTrue': 3.1,
    'navigation.course.calcValues.velocityMadeGood': 4.0,
    'navigation.course.calcValues.calcMethod': 'GreatCircle',
    'notifications.navigation.course.arrivalCircleEntered': {
      state: 'alert',
      method: ['visual'],
      message: 'Entered arrival zone'
    },
    'notifications.navigation.course.perpendicularPassed': {
      state: 'normal',
      method: [],
      message: ''
    }
  })
}

var mockNavGotoApp = {
  courseApi: {
    getCourse: async () => ({
      activeRoute: null,
      previousPoint: {
        type: 'VesselPosition',
        position: {
          latitude: 38.97496773616132,
          longitude: -76.48183979803126
        }
      },
      nextPoint: {
        type: 'Location',
        name: 'DP',
        position: {
          latitude: 32.0631296,
          longitude: -75.487264
        }
      }
    })
  },
  ...mockNavSelf({
    'navigation.course.calcValues.distance': 500,
    'navigation.course.calcValues.bearingTrue': 1.23,
    'navigation.course.calcValues.bearingTrackTrue': 1.25,
    'navigation.course.calcValues.velocityMadeGood': 0,
    'navigation.course.calcValues.calcMethod': 'GreatCircle',
    'notifications.navigation.course.arrivalCircleEntered': null,
    'notifications.navigation.course.perpendicularPassed': null
  })
}

var mockNavNoCourseApp = {
  courseApi: {
    // The Course API returns an object even without an active course
    getCourse: async () => ({ activeRoute: null })
  },
  ...mockNavSelf({})
}

// The distance is missing with the rest of the course still present.
var mockNavNoDistanceApp = {
  courseApi: {
    getCourse: async () => ({
      nextPoint: {
        type: 'RoutePoint',
        position: {
          latitude: 38.97496773616132,
          longitude: -76.48183979803126
        }
      },
      activeRoute: {
        href: 'mock',
        name: 'Test Route',
        reverse: false,
        pointIndex: 0,
        pointTotal: 6
      }
    })
  },
  ...mockNavSelf({
    'navigation.course.calcValues.distance': null
  })
}

// The distance has stopped updating. The server's meta.timeout handling is off
// by default, so the age is what expires it.
var mockNavStaleDistanceApp = {
  courseApi: {
    getCourse: async () => ({
      nextPoint: {
        type: 'RoutePoint',
        position: {
          latitude: 38.97496773616132,
          longitude: -76.48183979803126
        }
      },
      activeRoute: {
        href: 'mock',
        name: 'Test Route',
        reverse: false,
        pointIndex: 0,
        pointTotal: 6
      }
    })
  },
  getSelfPath: (key: string) => {
    if (key !== 'navigation.course.calcValues') return undefined
    const timestamp = Date.now() - navigationDataCalcValueTimeout - 1
    return {
      distance: { value: 12, timestamp },
      bearingTrue: { value: 1.23, timestamp },
      bearingTrackTrue: { value: 3.1, timestamp },
      velocityMadeGood: { value: 4, timestamp },
      calcMethod: { value: 'Rhumbline', timestamp }
    }
  }
}
