import path from 'path'
import _ from 'lodash'
import {
  PGN_130066,
  PGN_130067,
  WpNavigationMethod,
  WpRouteStatus
} from '@canboat/ts-pgns'
import { Type } from 'typebox'
import { App, Plugin, Conversion } from '../types'
import { type PluginOptions, settingsOf } from '../schema'
import { routeId } from '../routeId'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { courseOrigin } = require('../nmea2000Source')

// The active course as Route & WP Service PGNs: 130066 with the route's
// attributes, then 130067 with its waypoints. They go out once for each
// course. A Garmin GPSMAP saves every copy it receives as a new route, with a
// pop-up, until its 100 routes are used up, so a Resend would fill it. Under
// a Route ID it already has, it replaces that route's waypoints: so each
// route has its own (see routeId). Tested on a GPSMAP 723xsv; a B&G Vulcan
// ignores these PGNs.

// As 129285 gives the route
const DATABASE_ID = 0

// A fast packet holds at most 223 bytes. 130067 takes 10 for its header, and
// per waypoint 2 for the id, 2 plus the name's UTF-8 bytes for the name, and
// 8 for the position.
const FAST_PACKET_BYTES = 223
const HEADER_BYTES = 10
const WAYPOINT_BYTES = 12
// A longer name is cut short, so that a waypoint always fits in a packet
const NAME_MAX_BYTES = 32

const ROUTE_NAME_DEFAULT = 'Signal K'

const RouteWpServiceSettings = Type.Object({
  routeName: Type.Optional(
    Type.String({
      title: 'Route name',
      description:
        'The name sent for a single destination, and for a route that has no name',
      default: ROUTE_NAME_DEFAULT
    })
  )
})

interface Waypoint {
  id?: number
  name?: string
  latitude: number
  longitude: number
}

interface Course {
  routeId: number
  name: string
  navigationMethod?: WpNavigationMethod
  waypoints: Waypoint[]
}

// A name cut to at most NAME_MAX_BYTES of UTF-8, between characters
function shortName(name: unknown): string | undefined {
  if (typeof name !== 'string' || name === '') return undefined
  let result = ''
  for (const char of name) {
    if (Buffer.byteLength(result + char) > NAME_MAX_BYTES) break
    result += char
  }
  return result
}

function navigationMethodOf(app: App): WpNavigationMethod | undefined {
  const node = app.getSelfPath('navigation.course.calcValues.calcMethod')
  const method = node instanceof Object && 'value' in node ? node.value : node
  return method === 'GreatCircle'
    ? WpNavigationMethod.GreatCircle
    : method === 'Rhumbline'
      ? WpNavigationMethod.RhumbLine
      : undefined
}

// The active course, as the route to send. null without an active course;
// undefined when the route can't be read now, or stopped being the active
// one while it was read: the next tick tries again.
async function activeCourse(
  app: App,
  routeName: string
): Promise<Course | null | undefined> {
  const course = await app.courseApi.getCourse()
  if (!course?.nextPoint?.position) return null
  const navigationMethod = navigationMethodOf(app)

  if (!course.activeRoute?.href) {
    // A single destination is waypoint 1, as in 129284 and 129285; the
    // course's previous point, when there is one, precedes it as the origin,
    // without a number.
    const origin = course.previousPoint?.position
    const destination = course.nextPoint.position
    return {
      routeId: routeId(undefined, destination),
      name: shortName(routeName) ?? ROUTE_NAME_DEFAULT,
      navigationMethod,
      waypoints: [
        ...(origin
          ? [{ latitude: origin.latitude, longitude: origin.longitude }]
          : []),
        {
          id: 1,
          name: shortName(course.nextPoint.name) ?? 'Waypoint 1',
          latitude: destination.latitude,
          longitude: destination.longitude
        }
      ]
    }
  }

  const { href, name, reverse } = course.activeRoute
  let route: any
  try {
    route = await app.resourcesApi.getResource('routes', path.basename(href))
  } catch {
    return undefined
  }
  const coordinates = route?.feature?.geometry?.coordinates
  if (!Array.isArray(coordinates) || coordinates.length === 0) return undefined
  const active = (await app.courseApi.getCourse())?.activeRoute
  if (
    active?.href !== href ||
    active.name !== name ||
    Boolean(active.reverse) !== Boolean(reverse)
  )
    return undefined

  const meta = route.feature.properties?.coordinatesMeta
  const points = coordinates.map((coordinate: number[], i: number) => ({
    name: Array.isArray(meta) ? shortName(meta[i]?.name) : undefined,
    // GeoJSON coordinates are [longitude, latitude]
    latitude: coordinate[1],
    longitude: coordinate[0]
  }))
  // In the order the route is sailed, which the Course API's pointIndex
  // counts in, and 129284's destination waypoint number with it
  if (reverse) points.reverse()
  return {
    routeId: routeId(course.activeRoute),
    name: shortName(name) ?? shortName(routeName) ?? ROUTE_NAME_DEFAULT,
    navigationMethod,
    waypoints: points.map((point: Waypoint, i: number) => ({
      ...point,
      id: i + 1,
      name: point.name ?? `Waypoint ${i + 1}`
    }))
  }
}

function packets(waypoints: Waypoint[]): Waypoint[][] {
  const result: Waypoint[][] = []
  let packet: Waypoint[] = []
  let bytes = HEADER_BYTES
  waypoints.forEach((waypoint) => {
    const size = WAYPOINT_BYTES + Buffer.byteLength(waypoint.name ?? '')
    if (packet.length > 0 && bytes + size > FAST_PACKET_BYTES) {
      result.push(packet)
      packet = []
      bytes = HEADER_BYTES
    }
    packet.push(waypoint)
    bytes += size
  })
  if (packet.length > 0) result.push(packet)
  return result
}

function routeWpService(course: Course): (PGN_130066 | PGN_130067)[] {
  const total = course.waypoints.length
  let start = 0
  return [
    new PGN_130066({
      databaseId: DATABASE_ID,
      routeId: course.routeId,
      routeWpListName: course.name,
      numberOfWpsInTheRouteWpList: total,
      navigationMethod: course.navigationMethod,
      routeStatus: WpRouteStatus.Active
    }),
    ...packets(course.waypoints).map((list) => {
      const pgn = new PGN_130067({
        startRps: start,
        nitems: list.length,
        numberOfWpsInTheRouteWpList: total,
        databaseId: DATABASE_ID,
        routeId: course.routeId,
        list: list.map((waypoint) => ({
          wpId: waypoint.id,
          wpName: waypoint.name,
          wpLatitude: waypoint.latitude,
          wpLongitude: waypoint.longitude
        }))
      })
      start += list.length
      return pgn
    })
  ]
}

module.exports = (app: App, plugin: Plugin): Conversion => ({
  title: 'Route & WP Service (130066, 130067)',
  optionKey: 'ROUTEWPSERVICE',
  properties: RouteWpServiceSettings.properties,
  testOptions: { ROUTEWPSERVICE: {} },
  conversions: (options: PluginOptions): Conversion[] => {
    const settings = settingsOf(
      options,
      'ROUTEWPSERVICE',
      RouteWpServiceSettings
    )
    const origin = courseOrigin(app, settings?.allowNmea2000Sources)
    // What was sent last, kept per start of the plugin, so that a restart
    // sends the course again
    let lastSent: unknown
    let reading = false
    return [
      {
        // A timer rather than the course paths: a route that could not be
        // read is tried again on the next tick.
        interval: 2000,
        sourceType: 'timer',
        withheld: origin.withheld,
        callback: async (app: App) => {
          if (origin.withheld()) {
            // The course came from NMEA 2000: one set here later is sent
            lastSent = undefined
            return null
          }
          // A slow route read is not overtaken by the next tick
          if (reading) return null
          reading = true
          let course: Course | null | undefined
          try {
            course = await activeCourse(
              app,
              settings?.routeName ?? ROUTE_NAME_DEFAULT
            )
          } catch (err) {
            // Tried again on the next tick
            app.error(`Route & WP Service: ${err}`)
            return null
          } finally {
            reading = false
          }
          // A course from NMEA 2000 can have come in during the read
          if (origin.withheld()) {
            lastSent = undefined
            return null
          }
          if (course === undefined) return null
          if (course === null) {
            lastSent = undefined
            return null
          }
          // Reaching the next waypoint changes nothing that is sent
          if (_.isEqual(course, lastSent)) return null
          lastSent = course
          return routeWpService(course)
        },
        tests: [
          {
            input: [mockApp],
            expected: [
              {
                prio: 7,
                pgn: 130066,
                dst: 255,
                fields: {
                  'Database ID': 0,
                  'Route ID': 55691,
                  'Route/WP-List Name': 'Test Route',
                  'Change at Last Timestamp': [],
                  'Number of WPs in the Route/WP-List': 3,
                  'Critical supplementary parameters': [],
                  'Route Status': 'Active'
                }
              },
              {
                prio: 7,
                pgn: 130067,
                dst: 255,
                fields: {
                  'Start RPS#': 0,
                  nItems: 3,
                  'Number of WPs in the Route/WP-List': 3,
                  'Database ID': 0,
                  'Route ID': 55691,
                  list: [
                    {
                      'WP ID': 1,
                      'WP Name': 'Start',
                      'WP Latitude': 38.9749677,
                      'WP Longitude': -76.4818398
                    },
                    {
                      'WP ID': 2,
                      'WP Name': 'Waypoint 2',
                      'WP Latitude': 38.977234,
                      'WP Longitude': -76.4795366
                    },
                    {
                      'WP ID': 3,
                      'WP Name': 'Waypoint 3',
                      'WP Latitude': 38.9780512,
                      'WP Longitude': -76.4726708
                    }
                  ]
                }
              }
            ]
          }
        ]
      },
      {
        ...origin.conversion,
        // A course from NMEA 2000 forgets what was sent at once, not on the
        // next tick: what was sent may still have waited for its interval,
        // and been dropped, when a course set here follows before that tick
        callback: (delta: unknown) => {
          const result = origin.conversion.callback!(delta)
          if (origin.withheld()) lastSent = undefined
          return result
        }
      }
    ]
  }
})

const mockApp = {
  getSelfPath: () => undefined,
  courseApi: {
    getCourse: async () => ({
      nextPoint: { position: { latitude: 38.9780512, longitude: -76.4726708 } },
      activeRoute: {
        href: '/resources/v2/routes/r1',
        name: 'Test Route',
        reverse: false,
        pointIndex: 1,
        pointTotal: 3
      }
    })
  },
  resourcesApi: {
    getResource: async () => ({
      feature: {
        geometry: {
          coordinates: [
            [-76.4818398, 38.9749677],
            [-76.4795366, 38.977234],
            [-76.4726708, 38.9780512]
          ]
        },
        properties: { coordinatesMeta: [{ name: 'Start' }, {}, {}] }
      }
    })
  }
}
