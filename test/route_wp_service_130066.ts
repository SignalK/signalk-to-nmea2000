import chai from 'chai'
const assert: Chai.AssertStatic = chai.assert
import { pgnToActisenseSerialFormat, FromPgn } from '@canboat/canboatjs'
import type { Conversion } from '../types'

const parser = new FromPgn({ useCamel: false })

const ROUTE = [
  [-76.1, 38.1],
  [-76.2, 38.2],
  [-76.3, 38.3]
]

// A Signal K server with a course that a test can change
function makeApp() {
  const state: any = {
    course: null,
    route: { feature: { geometry: { coordinates: ROUTE } } },
    // Throws instead of returning the route when set
    routeError: undefined,
    // Called while the route is read
    onRead: undefined,
    calcMethod: undefined,
    sources: {}
  }
  const app: any = {
    debug: () => {},
    error: () => {},
    getSelfPath: (path: string) =>
      path === 'navigation.course.calcValues.calcMethod'
        ? state.calcMethod
        : undefined,
    getPath: (path: string) => (path === 'sources' ? state.sources : undefined),
    courseApi: { getCourse: async () => state.course },
    resourcesApi: {
      getResource: async () => {
        if (state.onRead) state.onRead()
        if (state.routeError) throw state.routeError
        return state.route
      }
    }
  }
  return { app, state }
}

function routeCourse(extra: object = {}) {
  return {
    nextPoint: { position: { latitude: 38.2, longitude: -76.2 } },
    activeRoute: {
      href: '/resources/v2/routes/r1',
      name: 'R1',
      reverse: false,
      pointIndex: 1,
      pointTotal: 3,
      ...extra
    }
  }
}

// The timer conversion and the one that follows the course's origin
function start(app: any, settings: object = {}) {
  const conversion: Conversion = require('../dist/conversions/routeWpService')(
    app,
    {}
  )
  const [timer, origin] = (
    conversion.conversions as (options: unknown) => Conversion[]
  )({ ROUTEWPSERVICE: { enabled: true, ...settings } })
  return {
    tick: async () => {
      const pgns: any = await timer.callback!(app)
      return (pgns || []).map((pgn: any) => {
        const line = pgnToActisenseSerialFormat(pgn)!
        return {
          bytes: line.split(',').length - 6,
          ...parser.parseString(line)
        }
      })
    },
    origin,
    timer
  }
}

const waypoints = (pgns: any[]) =>
  pgns
    .filter((pgn) => pgn.pgn === 130067)
    .flatMap((pgn) => pgn.fields.list)
    .map((wp: any) => [wp['WP ID'], wp['WP Name'], wp['WP Latitude']])

describe('Route & WP Service 130066/130067', function () {
  it('sends a route once, and not again when the next waypoint is reached', async function () {
    const { app, state } = makeApp()
    const service = start(app)
    state.course = routeCourse()
    const pgns = await service.tick()
    assert.deepEqual(
      pgns.map((pgn: any) => pgn.pgn),
      [130066, 130067]
    )
    assert.equal(pgns[0].fields['Route/WP-List Name'], 'R1')
    assert.equal(pgns[0].fields['Number of WPs in the Route/WP-List'], 3)
    assert.deepEqual(waypoints(pgns), [
      [1, 'Waypoint 1', 38.1],
      [2, 'Waypoint 2', 38.2],
      [3, 'Waypoint 3', 38.3]
    ])
    assert.deepEqual(await service.tick(), [])
    state.course = routeCourse({ pointIndex: 2 })
    state.course.nextPoint.position = { latitude: 38.3, longitude: -76.3 }
    assert.deepEqual(await service.tick(), [])
  })

  it('lists a reversed route in the order it is sailed', async function () {
    const { app, state } = makeApp()
    const service = start(app)
    state.course = routeCourse({ reverse: true })
    // pointIndex 1 of a reversed route is its second point from the end
    assert.deepEqual(waypoints(await service.tick()), [
      [1, 'Waypoint 1', 38.3],
      [2, 'Waypoint 2', 38.2],
      [3, 'Waypoint 3', 38.1]
    ])
  })

  it('sends the route again when it is reversed, under the same Route ID', async function () {
    const { app, state } = makeApp()
    const service = start(app)
    state.course = routeCourse()
    const forward = await service.tick()
    state.course = routeCourse({ reverse: true })
    const reversed = await service.tick()
    assert.equal(reversed.length, 2)
    // a chartplotter replaces the waypoints of the route it has under it
    assert.equal(reversed[0].fields['Route ID'], forward[0].fields['Route ID'])
  })

  it('gives each route a Route ID of its own, the same in 130066 and 130067', async function () {
    const { app, state } = makeApp()
    const service = start(app)
    state.course = routeCourse()
    const first = await service.tick()
    state.course = routeCourse({ href: '/resources/v2/routes/r2' })
    const second = await service.tick()
    const ids = (pgns: any[]) => pgns.map((pgn) => pgn.fields['Route ID'])
    assert.equal(new Set(ids(first)).size, 1)
    assert.equal(new Set(ids(second)).size, 1)
    assert.notEqual(ids(first)[0], ids(second)[0])
    ids([...first, ...second]).forEach((id) => {
      assert.isAtLeast(id, 1)
      assert.isAtMost(id, 65532)
    })
  })

  it('gives a single destination a Route ID of its own', async function () {
    const { app, state } = makeApp()
    const service = start(app)
    state.course = {
      nextPoint: { position: { latitude: 38.5, longitude: -76.5 } }
    }
    const one = (await service.tick())[0].fields['Route ID']
    state.course = {
      nextPoint: { position: { latitude: 38.6, longitude: -76.5 } }
    }
    const other = (await service.tick())[0].fields['Route ID']
    assert.notEqual(one, other)
  })

  it("names the waypoints from the route's coordinatesMeta", async function () {
    const { app, state } = makeApp()
    const service = start(app)
    state.route.feature.properties = {
      coordinatesMeta: [{ name: 'Harbour' }, { href: '/x' }, { name: '' }]
    }
    state.course = routeCourse()
    assert.deepEqual(
      waypoints(await service.tick()).map((wp) => wp[1]),
      ['Harbour', 'Waypoint 2', 'Waypoint 3']
    )
  })

  it('sends a single destination as waypoint 1, after its origin', async function () {
    const { app, state } = makeApp()
    const service = start(app, { routeName: 'BOAT' })
    state.course = {
      nextPoint: { name: 'DP', position: { latitude: 38.5, longitude: -76.5 } },
      previousPoint: { position: { latitude: 38.4, longitude: -76.4 } }
    }
    const pgns = await service.tick()
    assert.equal(pgns[0].fields['Route/WP-List Name'], 'BOAT')
    assert.equal(pgns[0].fields['Number of WPs in the Route/WP-List'], 2)
    const list = pgns[1].fields.list
    assert.equal(list.length, 2)
    assert.notProperty(list[0], 'WP ID')
    assert.equal(list[0]['WP Latitude'], 38.4)
    assert.deepEqual(waypoints(pgns)[1], [1, 'DP', 38.5])
  })

  it('sends a single destination without a previous point alone', async function () {
    const { app, state } = makeApp()
    const service = start(app)
    state.course = {
      nextPoint: { position: { latitude: 38.5, longitude: -76.5 } }
    }
    const pgns = await service.tick()
    assert.equal(pgns[0].fields['Route/WP-List Name'], 'Signal K')
    assert.deepEqual(waypoints(pgns), [[1, 'Waypoint 1', 38.5]])
  })

  it('sends nothing without an active course, and the course again once one is set', async function () {
    const { app, state } = makeApp()
    const service = start(app)
    assert.deepEqual(await service.tick(), [])
    state.course = routeCourse()
    assert.equal((await service.tick()).length, 2)
    state.course = { nextPoint: null }
    assert.deepEqual(await service.tick(), [])
    state.course = routeCourse()
    assert.equal((await service.tick()).length, 2)
  })

  it('tries a route it could not read again, without sending a destination instead', async function () {
    const { app, state } = makeApp()
    const service = start(app)
    state.course = routeCourse()
    state.routeError = new Error('not found')
    assert.deepEqual(await service.tick(), [])
    state.routeError = undefined
    assert.deepEqual(
      (await service.tick()).map((pgn: any) => pgn.pgn),
      [130066, 130067]
    )
  })

  it('leaves out a route that stopped being active while it was read', async function () {
    const { app, state } = makeApp()
    const service = start(app)
    state.course = routeCourse()
    state.onRead = () => {
      state.course = routeCourse({ href: '/resources/v2/routes/r2' })
    }
    assert.deepEqual(await service.tick(), [])
  })

  it('splits a long route into 130067 packets that each fit a fast packet', async function () {
    const { app, state } = makeApp()
    const service = start(app)
    const coordinates = Array.from({ length: 40 }, (_, i) => [
      -76 - i / 100,
      38 + i / 100
    ])
    state.route.feature.geometry.coordinates = coordinates
    state.route.feature.properties = {
      // A name longer than a packet allows is cut short
      coordinatesMeta: [{ name: 'Ø'.repeat(100) }]
    }
    state.course = routeCourse({ pointTotal: 40 })
    const pgns = await service.tick()
    const lists = pgns.filter((pgn: any) => pgn.pgn === 130067)
    assert.isAbove(lists.length, 1)
    lists.forEach((pgn: any) => assert.isAtMost(pgn.bytes, 223))
    let first = 0
    lists.forEach((pgn: any) => {
      assert.equal(pgn.fields['Start RPS#'], first)
      assert.equal(pgn.fields.nItems, pgn.fields.list.length)
      assert.equal(pgn.fields['Number of WPs in the Route/WP-List'], 40)
      first += pgn.fields.list.length
    })
    assert.equal(first, 40)
    const ids = waypoints(pgns).map((wp) => wp[0])
    assert.deepEqual(
      ids,
      Array.from({ length: 40 }, (_, i) => i + 1)
    )
    assert.equal(waypoints(pgns)[0][1], 'Ø'.repeat(16))
  })

  it('sends the navigation method the course is calculated with', async function () {
    const { app, state } = makeApp()
    const service = start(app)
    state.calcMethod = { value: 'Rhumbline' }
    state.course = routeCourse()
    const pgns = await service.tick()
    assert.equal(pgns[0].fields['Navigation Method'], 'Rhumb Line')
  })

  it('sends the course again after the plugin restarts', async function () {
    const { app, state } = makeApp()
    state.course = routeCourse()
    assert.equal((await start(app).tick()).length, 2)
    assert.equal((await start(app).tick()).length, 2)
  })

  describe('a course from NMEA 2000', function () {
    function fromNmea2000(service: any, $source: string) {
      service.origin.callback!({
        updates: [
          {
            $source,
            values: [{ path: 'navigation.course.nextPoint', value: {} }]
          }
        ]
      })
    }

    it('is not sent back to the bus', async function () {
      const { app, state } = makeApp()
      state.sources = { can0: { type: 'NMEA2000' } }
      const service = start(app)
      state.course = routeCourse()
      fromNmea2000(service, 'can0.3')
      assert.isTrue(service.timer.withheld && (service.timer.withheld as any)())
      assert.deepEqual(await service.tick(), [])
    })

    it('is sent when the setting allows NMEA 2000 sources', async function () {
      const { app, state } = makeApp()
      state.sources = { can0: { type: 'NMEA2000' } }
      const service = start(app, { allowNmea2000Sources: true })
      state.course = routeCourse()
      fromNmea2000(service, 'can0.3')
      assert.equal((await service.tick()).length, 2)
    })

    it('does not stop the same course from being sent once it is set here', async function () {
      const { app, state } = makeApp()
      state.sources = { can0: { type: 'NMEA2000' } }
      const service = start(app)
      state.course = routeCourse()
      assert.equal((await service.tick()).length, 2)
      fromNmea2000(service, 'can0.3')
      assert.deepEqual(await service.tick(), [])
      fromNmea2000(service, 'courseApi')
      assert.equal((await service.tick()).length, 2)
    })
  })
})
