import chai from 'chai'
const assert: Chai.AssertStatic = chai.assert
import { pgnToActisenseSerialFormat } from '@canboat/canboatjs'
import type { Conversion } from '../types'

// The conversion tests compare decoded fields, which leave out the reserved
// ones. These check the reserved bits of a 129285 route packet in its bytes.
describe('Route/WP Information 129285', function () {
  const app: any = {
    debug: () => {},
    error: () => {},
    getSelfPath: () => undefined,
    courseApi: {
      getCourse: async () => ({
        nextPoint: { position: { latitude: -35.1, longitude: 138.1 } },
        activeRoute: { href: '/resources/routes/r1', name: 'R' }
      })
    },
    resourcesApi: {
      getResource: async () => ({
        feature: {
          geometry: {
            coordinates: [
              [138.1, -35.1],
              [138.2, -35.2]
            ]
          }
        }
      })
    }
  }

  async function routePacketBytes(): Promise<number[]> {
    const conversions: Conversion[] =
      require('../dist/conversions/navigationdata')(app, {})
    const routeWP = conversions.find(
      (c) => c.optionKey === 'routewpinformation'
    )!
    const [conversion] = (
      routeWP.conversions as (options: unknown) => Conversion[]
    )({})
    const pgns: any = await conversion.callback!(app)
    assert.equal(pgns.length, 1)
    // timestamp,prio,pgn,src,dst,len,data bytes...
    return pgnToActisenseSerialFormat(pgns[0])!
      .split(',')
      .slice(6)
      .map((byte) => parseInt(byte, 16))
  }

  it('sets the reserved bits of a route packet to ones', async function () {
    const data = await routePacketBytes()
    // Start RPS#, nItems, Database ID and Route ID: 2 bytes each
    const flags = data[8]
    assert.equal(flags & 0x07, 0, 'Navigation direction in route: Forward')
    assert.equal(
      (flags >> 3) & 0x03,
      0,
      'Supplementary Route/WP data available: Off'
    )
    assert.equal(flags >> 5, 0x07, 'the 3 reserved bits')

    // Route Name "R": length 3, encoding 1 (ASCII), one character
    assert.deepEqual(data.slice(9, 12), [3, 1, 'R'.charCodeAt(0)])
    assert.equal(data[12], 0xff, 'the reserved byte after the route name')
  })

  it('lists a reversed route in the order it is sailed, as 129284 numbers it', async function () {
    const course = await app.courseApi.getCourse()
    const reversedApp = {
      ...app,
      courseApi: {
        getCourse: async () => ({
          ...course,
          activeRoute: { ...course.activeRoute, reverse: true }
        })
      }
    }
    const conversions: Conversion[] =
      require('../dist/conversions/navigationdata')(reversedApp, {})
    const routeWP = conversions.find(
      (c) => c.optionKey === 'routewpinformation'
    )!
    const [conversion] = (
      routeWP.conversions as (options: unknown) => Conversion[]
    )({})
    const [pgn]: any = await conversion.callback!(reversedApp)
    assert.equal(pgn.fields.navigationDirectionInRoute, 'Forward')
    assert.deepEqual(
      pgn.fields.list.map((wp: any) => [wp.wpId, wp.wpLatitude]),
      [
        [1, -35.2],
        [2, -35.1]
      ]
    )
  })
  async function routeWP(app: any): Promise<any> {
    const conversions: Conversion[] =
      require('../dist/conversions/navigationdata')(app, {})
    const route = conversions.find((c) => c.optionKey === 'routewpinformation')!
    const [conversion] = (
      route.conversions as (options: unknown) => Conversion[]
    )({})
    return conversion.callback!(app)
  }

  it('sends the origin and only the forward waypoints as one packet', async function () {
    const coordinates = [
      [138.1, -35.1],
      [138.2, -35.2],
      [138.3, -35.3],
      [138.4, -35.4],
      [138.5, -35.5],
      [138.6, -35.6]
    ]
    const app: any = {
      debug: () => {},
      error: () => {},
      getSelfPath: () => undefined,
      courseApi: {
        getCourse: async () => ({
          nextPoint: {
            type: 'RoutePoint',
            name: 'Waypoint 3',
            position: { latitude: -35.3, longitude: 138.3 }
          },
          previousPoint: {
            type: 'RoutePoint',
            position: { latitude: -35.2, longitude: 138.2 }
          },
          activeRoute: {
            href: '/resources/routes/r1',
            name: 'R',
            reverse: false,
            pointIndex: 2,
            pointTotal: 6
          }
        })
      },
      resourcesApi: {
        getResource: async () => ({
          feature: { geometry: { coordinates } }
        })
      }
    }

    const pgns = await routeWP(app)
    assert.equal(pgns.length, 1)
    const [pgn] = pgns
    assert.equal(pgn.fields.startRps, 2)
    assert.equal(pgn.fields.nitems, 5)
    assert.deepEqual(
      pgn.fields.list.map((wp: any) => wp.wpId),
      [2, 3, 4, 5, 6]
    )
    assert.equal(pgn.fields.list[0].wpLatitude, -35.2)
    assert.equal(pgn.fields.list[4].wpLatitude, -35.6)
  })

  it('fills one packet with forward waypoints and does not cycle chunks', async function () {
    const coordinates = Array.from({ length: 20 }, (_, i) => [
      138 + i / 100,
      -35 - i / 100
    ])
    const app: any = {
      debug: () => {},
      error: () => {},
      getSelfPath: () => undefined,
      courseApi: {
        getCourse: async () => ({
          nextPoint: {
            type: 'RoutePoint',
            position: { latitude: -35, longitude: 138 }
          },
          previousPoint: {
            type: 'VesselPosition',
            position: { latitude: -35, longitude: 138 }
          },
          activeRoute: {
            href: '/resources/routes/r1',
            name: 'R',
            reverse: false,
            pointIndex: 0,
            pointTotal: 20
          }
        })
      },
      resourcesApi: {
        getResource: async () => ({
          feature: { geometry: { coordinates } }
        })
      }
    }

    const pgns = await routeWP(app)
    assert.equal(pgns.length, 1)
    const [pgn] = pgns
    assert.isAbove(pgn.fields.nitems, 2)
    assert.isBelow(pgn.fields.nitems, 21)
    const line = pgnToActisenseSerialFormat(pgn)!
    assert.isAtMost(parseInt(line.split(',')[5], 10), 223)
  })
})
