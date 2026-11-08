import { FromPgn } from '@canboat/canboatjs'
const Bacon = require('baconjs')
import chai from 'chai'
const assert: Chai.AssertStatic = chai.assert
import sinon from 'sinon'

// Sends every PGN at once: these tests are not about the rate limit
const unlimited = {
  send: (_pgn: unknown, buses: string[], send: (bus: string) => void) =>
    buses.forEach(send),
  cancel() {},
  stop() {}
}

// Runs the plugin against a mock app whose streambundle hands out real Bacon
// buses, the same way the server's StreamBundle does. Guards the
// onValueChange path in index.js (timeoutingArrayStream), which is not
// covered by the per-conversion tests.
interface AppOptions {
  selfData?: Record<string, unknown>
  sources?: Record<string, unknown>
}

interface Subscriber {
  subscription: { subscribe: { path: string }[] }
  callback: (delta: unknown) => void
}

interface TestPgn {
  pgn: number
  fields: Record<string, any>
}

function makeApp({
  selfData: providedSelfData = {},
  sources = {}
}: AppOptions = {}): any {
  const buses: Record<string, any> = {}
  const busUnsubscribes: sinon.SinonSpy[] = []
  const emitted: any[] = []
  const subscribers: Subscriber[] = []
  const debugMessages: string[] = []
  const debug = Object.assign(
    (message: string) => debugMessages.push(message),
    { enabled: false }
  )
  const selfData: Record<string, unknown> = {
    'environment.depth.surfaceToTransducer.value': 1,
    ...providedSelfData
  }
  return {
    emitted,
    buses,
    busUnsubscribes,
    debugMessages,
    subscribers,
    selfData,
    sources,
    debug,
    error: () => {},
    getSelfPath: (p: string) => selfData[p],
    getPath: (p: string) => (p === 'sources' ? sources : undefined),
    subscriptionmanager: {
      subscribe: (
        subscription: Subscriber['subscription'],
        unsubscribes: unknown[],
        onError: unknown,
        callback: Subscriber['callback']
      ) => {
        subscribers.push({ subscription, callback })
      }
    },
    signalk: { self: {}, on: () => {} },
    selfId: 'urn:mrn:signalk:uuid:test',
    emit: (event: string, pgn: string) => {
      if (event === 'nmea2000out') {
        emitted.push(new FromPgn({ useCamel: false }).parseString(pgn))
      }
    },
    streambundle: {
      getSelfBus: (path: string) => {
        if (!buses[path]) {
          buses[path] = new Bacon.Bus()
          const onValue = buses[path].onValue.bind(buses[path])
          buses[path].onValue = (callback: (...args: any[]) => void) => {
            const unsubscribe = sinon.spy(onValue(callback))
            busUnsubscribes.push(unsubscribe)
            return unsubscribe
          }
        }
        return buses[path]
      }
    }
  }
}

function startEngineParameters(
  app: any,
  engine: {
    signalkId: string
    instanceId: number
    notificationSources?: Record<string, string>
  } = { signalkId: 'engines.port', instanceId: 0 },
  extraOptions: Record<string, unknown> = {}
): any {
  const plugin = require('../dist/index.js')(app, unlimited)
  plugin.start({
    ENGINE_PARAMETERS: {
      enabled: true,
      engines: [engine],
      ...extraOptions
    }
  })
  return plugin
}

function publish(
  app: any,
  path: string,
  value: unknown,
  sourceId = 'test.1',
  source: Record<string, unknown> = {}
) {
  app.buses[path].push({ path, value, $source: sourceId, source })
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

describe('onValueChange conversions over the streambundle', () => {
  it('unsubscribes from self buses when the plugin stops', () => {
    const app = makeApp()
    const plugin = startEngineParameters(app)

    assert.isNotEmpty(app.busUnsubscribes)
    plugin.stop()

    assert.isTrue(
      app.busUnsubscribes.every(
        (unsubscribe: sinon.SinonSpy) => unsubscribe.calledOnce
      )
    )
  })

  it('sends an input that stopped updating as not available (#7)', async () => {
    const app = makeApp()
    const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['Date'] })
    const plugin = require('../dist/index.js')(app, unlimited)
    plugin.start({ WINDv2: { enabled: true }, HEADINGv2: { enabled: true } })
    try {
      publish(app, 'environment.wind.angleApparent', 0.5)
      publish(app, 'environment.wind.speedApparent', 6.1)
      publish(app, 'navigation.magneticVariation', 0.03)
      publish(app, 'navigation.headingMagnetic', 1.2)
      await settle()
      let wind = app.emitted.filter((pgn: TestPgn) => pgn.pgn === 130306).pop()
      assert.equal(wind.fields['Wind Speed'], 6.1)

      // A sensor that fails must not leave its last value on the bus while
      // the other one keeps the PGN going
      clock.tick(11000)
      publish(app, 'environment.wind.angleApparent', 0.6)
      publish(app, 'navigation.headingMagnetic', 1.3)
      await settle()
      wind = app.emitted.filter((pgn: TestPgn) => pgn.pgn === 130306).pop()
      assert.closeTo(wind.fields['Wind Angle'], 0.6, 0.0001)
      assert.notProperty(wind.fields, 'Wind Speed')

      // The variation seldom changes, so it does not time out
      const heading = app.emitted
        .filter((pgn: TestPgn) => pgn.pgn === 127250)
        .pop()
      assert.closeTo(heading.fields.Heading, 1.3, 0.0001)
      assert.closeTo(heading.fields.Variation, 0.03, 0.0001)

      // A variation update must not bring back a heading that has expired
      clock.tick(11000)
      publish(app, 'navigation.magneticVariation', 0.04)
      await settle()
      const variationOnly = app.emitted
        .filter((pgn: TestPgn) => pgn.pgn === 127250)
        .pop()
      assert.closeTo(variationOnly.fields.Variation, 0.04, 0.0001)
      assert.notProperty(variationOnly.fields, 'Heading')
    } finally {
      clock.restore()
      plugin.stop()
    }
  })

  it('keeps an input for the resend duration while resending', async () => {
    const app = makeApp()
    // The streams' debounce keeps real time; the resend timer is faked
    const clock = sinon.useFakeTimers({
      now: Date.now(),
      toFake: ['Date', 'setInterval', 'clearInterval']
    })
    const plugin = require('../dist/index.js')(app, unlimited)
    plugin.start({ WINDv2: { enabled: true, resend: 1, resendTime: 30 } })
    const lastWind = () =>
      app.emitted.filter((pgn: TestPgn) => pgn.pgn === 130306).pop()
    try {
      publish(app, 'environment.wind.angleApparent', 0.5)
      publish(app, 'environment.wind.speedApparent', 6.1)
      await settle()

      // Resending for 30 s says the speed holds that long, past the 10 s
      // timeout of the wind inputs
      await clock.tickAsync(20000)
      publish(app, 'environment.wind.angleApparent', 0.6)
      await settle()
      assert.equal(lastWind().fields['Wind Speed'], 6.1)

      // The angle restarted the resend, but the speed in it expires at 30 s
      const resent = () =>
        app.emitted.filter((pgn: TestPgn) => pgn.pgn === 130306).length
      await clock.tickAsync(9500)
      await settle()
      const atExpiry = resent()
      await clock.tickAsync(1000)
      await settle()
      assert.equal(resent(), atExpiry, 'not resent once the speed expires')

      await clock.tickAsync(500)
      publish(app, 'environment.wind.angleApparent', 0.7)
      await settle()
      assert.closeTo(lastWind().fields['Wind Angle'], 0.7, 0.0001)
      assert.notProperty(lastWind().fields, 'Wind Speed')
    } finally {
      clock.restore()
      plugin.stop()
    }
  })

  it('emits a PGN from values pushed onto a self bus', async () => {
    const app = makeApp()
    app.debug.enabled = true
    const plugin = require('../dist/index.js')(app, unlimited)
    plugin.start({ DEPTHv2: { enabled: true } })

    app.buses['environment.depth.belowTransducer'].push({
      path: 'environment.depth.belowTransducer',
      value: 4.5,
      $source: 'test.1'
    })

    // combinedBus.debounce(10) plus Promise.all in processToN2K
    await new Promise((resolve) => setTimeout(resolve, 50))
    plugin.stop()

    assert.equal(app.emitted.length, 1)
    assert.equal(app.emitted[0].pgn, 128267)
    assert.deepEqual(app.emitted[0].fields, { Depth: 4.5, Offset: 1 })
    assert.isTrue(
      app.debugMessages.some(
        (message: string) =>
          message.startsWith('emit nmea2000out ') &&
          message.includes(',3,128267,')
      )
    )
  })

  it('uses the Signal K engine notification paths for all discrete status fields', async () => {
    const app = makeApp()
    const plugin = startEngineParameters(app)
    const active = { state: 'alarm' }
    publish(app, 'notifications.propulsion.engines.port.eGRSystem', active)
    publish(
      app,
      'notifications.propulsion.engines.port.emergencyStopMode',
      active
    )
    publish(app, 'notifications.propulsion.engines.port.commError', active)
    publish(app, 'notifications.propulsion.engines.port.shuttingDown', active)

    await settle()
    plugin.stop()

    const enginePgn = app.emitted.find((pgn: TestPgn) => pgn.pgn === 127489)
    assert.exists(enginePgn)
    assert.deepEqual(enginePgn.fields['Discrete Status 1'], [
      'EGR System',
      'Emergency Stop'
    ])
    assert.deepEqual(enginePgn.fields['Discrete Status 2'], [
      'Engine Comm Error',
      'Engine Shutting Down'
    ])
  })

  it('does not set an engine status bit for a nominal notification', async () => {
    const app = makeApp()
    const plugin = startEngineParameters(app)
    publish(app, 'notifications.propulsion.engines.port.lowOilPressure', {
      state: 'nominal'
    })
    publish(app, 'propulsion.engines.port.oilPressure', 102700)

    await settle()
    plugin.stop()

    const enginePgn = app.emitted.find((pgn: TestPgn) => pgn.pgn === 127489)
    assert.exists(enginePgn)
    assert.deepEqual(enginePgn.fields['Discrete Status 1'], [])
  })

  it('does not send 127489 for a nominal notification without readings', async () => {
    const app = makeApp()
    const plugin = startEngineParameters(app)
    publish(app, 'notifications.propulsion.engines.port.lowOilPressure', {
      state: 'nominal'
    })

    await settle()
    plugin.stop()

    assert.notExists(app.emitted.find((pgn: TestPgn) => pgn.pgn === 127489))
  })

  it('clears an active notification on normal and null updates', async () => {
    const app = makeApp()
    const plugin = startEngineParameters(app)
    const notificationPath = 'notifications.propulsion.engines.port.checkEngine'
    publish(app, notificationPath, { state: 'alarm' })
    await settle()
    const pgnsBeforeNormal = app.emitted.filter(
      (pgn: { pgn: number }) => pgn.pgn === 127489
    ).length
    publish(app, notificationPath, { state: 'normal' })
    await settle()
    const pgnsAfterNormal = app.emitted.filter(
      (pgn: { pgn: number }) => pgn.pgn === 127489
    )
    assert.isAbove(pgnsAfterNormal.length, pgnsBeforeNormal)
    assert.deepEqual(
      pgnsAfterNormal[pgnsAfterNormal.length - 1].fields['Discrete Status 1'],
      []
    )
    publish(app, notificationPath, null)
    await settle()
    plugin.stop()

    const enginePgns = app.emitted.filter((pgn: TestPgn) => pgn.pgn === 127489)
    assert.deepEqual(enginePgns[0].fields['Discrete Status 1'], [
      'Check Engine'
    ])
    assert.deepEqual(
      enginePgns[enginePgns.length - 1].fields['Discrete Status 1'],
      []
    )
  })

  it('loads active notifications at startup and retains them beyond the measurement timeout', async () => {
    const notificationPath = 'notifications.propulsion.engines.port.checkEngine'
    const app = makeApp({
      selfData: {
        [notificationPath]: {
          value: { state: 'alarm', message: 'Check engine' },
          $source: 'controller.1'
        }
      }
    })
    const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['Date'] })
    const plugin = startEngineParameters(app)

    try {
      await settle()
      let enginePgn = app.emitted.find((pgn: TestPgn) => pgn.pgn === 127489)
      assert.exists(enginePgn)
      assert.deepEqual(enginePgn.fields['Discrete Status 1'], ['Check Engine'])

      clock.tick(11000)
      publish(app, 'propulsion.engines.port.oilPressure', 120000)
      await settle()

      enginePgn = app.emitted.filter((pgn: TestPgn) => pgn.pgn === 127489).pop()
      assert.deepEqual(enginePgn.fields['Discrete Status 1'], ['Check Engine'])
    } finally {
      clock.restore()
      plugin.stop()
    }
  })

  it('respects selected notification sources when loading current status', async () => {
    const notificationPath = 'notifications.propulsion.engines.port.checkEngine'
    const app = makeApp({
      selfData: {
        [notificationPath]: {
          value: { state: 'alarm' },
          $source: 'other-controller.1'
        }
      }
    })

    const plugin = startEngineParameters(app, {
      signalkId: 'engines.port',
      instanceId: 0,
      notificationSources: {
        checkEngine: 'selected-controller.1'
      }
    })

    publish(app, 'propulsion.engines.port.oilPressure', 120000)
    await settle()
    let enginePgn = app.emitted
      .filter((pgn: TestPgn) => pgn.pgn === 127489)
      .pop()
    assert.exists(enginePgn)
    assert.deepEqual(enginePgn.fields['Discrete Status 1'], [])

    publish(app, notificationPath, { state: 'alarm' }, 'selected-controller.1')
    await settle()
    plugin.stop()

    enginePgn = app.emitted.filter((pgn: TestPgn) => pgn.pgn === 127489).pop()
    assert.deepEqual(enginePgn.fields['Discrete Status 1'], ['Check Engine'])
  })

  it('exposes selectors for every engine notification in the configuration schema', () => {
    const app = makeApp()
    const plugin = require('../dist/index.js')(app, unlimited)
    const schema = plugin.schema()
    const sourceProperties =
      schema.properties.ENGINE_PARAMETERS.properties.engines.items.properties
        .notificationSources.properties

    assert.containsAllKeys(sourceProperties, [
      'checkEngine',
      'emergencyStopMode',
      'warningLevel1',
      'shuttingDown'
    ])
    assert.lengthOf(Object.keys(sourceProperties), 24)
  })

  it('ignores NMEA 2000 notification inputs without withholding engine measurements', async () => {
    const notificationPath = 'notifications.propulsion.engines.port.checkEngine'
    const app = makeApp({
      selfData: {
        [notificationPath]: {
          value: { state: 'alarm' },
          $source: 'n2k.100'
        }
      },
      sources: {
        n2k: { type: 'NMEA2000' }
      }
    })
    const plugin = startEngineParameters(app)
    publish(app, notificationPath, { state: 'alarm' }, 'n2k.100')
    publish(app, 'propulsion.engines.port.oilPressure', 120000, 'sensor.1', {
      type: 'Signal K'
    })

    await settle()
    plugin.stop()

    const enginePgn = app.emitted.find((pgn: TestPgn) => pgn.pgn === 127489)
    assert.exists(enginePgn)
    assert.deepEqual(enginePgn.fields['Discrete Status 1'], [])
  })

  it('withholds explicitly selected NMEA 2000 notification sources unless allowed', async () => {
    const notificationPath = 'notifications.propulsion.engines.port.checkEngine'
    const engine = {
      signalkId: 'engines.port',
      instanceId: 0,
      notificationSources: { checkEngine: 'n2k.100' }
    }
    const app = makeApp({
      sources: {
        n2k: { type: 'NMEA2000' }
      }
    })
    const plugin = startEngineParameters(app, engine)
    publish(app, notificationPath, { state: 'alarm' }, 'n2k.100', {
      type: 'NMEA2000'
    })
    publish(app, 'propulsion.engines.port.oilPressure', 120000)
    await settle()
    plugin.stop()
    assert.lengthOf(
      app.emitted.filter((pgn: { pgn: number }) => pgn.pgn === 127489),
      0
    )

    const allowedApp = makeApp({
      sources: {
        n2k: { type: 'NMEA2000' }
      }
    })
    const allowedPlugin = startEngineParameters(allowedApp, engine, {
      allowNmea2000Sources: true
    })
    publish(allowedApp, notificationPath, { state: 'alarm' }, 'n2k.100')
    publish(allowedApp, 'propulsion.engines.port.oilPressure', 120000)
    await settle()
    allowedPlugin.stop()
    const allowedPgn = allowedApp.emitted.find(
      (pgn: { pgn: number }) => pgn.pgn === 127489
    )
    assert.exists(allowedPgn)
    assert.deepEqual(allowedPgn.fields['Discrete Status 1'], ['Check Engine'])
  })

  it('sends 129285 as soon as the course changes, once per change', async () => {
    const app = makeApp()
    let course = goto({ latitude: -35.5, longitude: 138.7 })
    app.courseApi = { getCourse: async () => course }
    const plugin = require('../dist/index.js')(app, unlimited)
    plugin.start({ routewpinformation: { enabled: true } })

    const publish = () =>
      (['activeRoute', 'nextPoint', 'previousPoint'] as const).forEach((key) =>
        app.buses[`navigation.course.${key}`].push({
          path: `navigation.course.${key}`,
          value: course[key],
          $source: 'courseApi'
        })
      )
    const settle = () => new Promise((resolve) => setTimeout(resolve, 50))
    const routeInfo = () =>
      app.emitted.filter((pgn: { pgn: number }) => pgn.pgn === 129285)
    // Only Date: the streams and the 2 s timer keep real time
    const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['Date'] })

    try {
      publish()
      await settle()
      assert.equal(routeInfo().length, 1)

      publish()
      await settle()
      assert.equal(routeInfo().length, 1, 'an unchanged course is not resent')

      clock.tick(1000)
      course = goto({ latitude: -35.6, longitude: 138.8 })
      publish()
      await settle()
      assert.equal(routeInfo().length, 2)
      assert.equal(routeInfo()[1].fields.list[1]['WP Latitude'], -35.6)

      // Within a second of the last one, a change waits for the timer
      clock.tick(500)
      course = goto({ latitude: -35.7, longitude: 138.9 })
      publish()
      await settle()
      assert.equal(routeInfo().length, 2, 'at most one per second')

      clock.tick(500)
      course = goto({ latitude: -35.8, longitude: 139.0 })
      publish()
      await settle()
      assert.equal(routeInfo().length, 3)
      assert.equal(routeInfo()[2].fields.list[1]['WP Latitude'], -35.8)
    } finally {
      clock.restore()
      plugin.stop()
    }
  })
})

// A chartplotter's destination reaches the Course API over NMEA 2000, and the
// API publishes navigation.course.nextPoint with that device's $source and no
// source object. Sending it, or its route and calculated values, back would
// put a second copy of the chartplotter's course on the bus.
describe('a course that came from NMEA 2000', () => {
  const N2K_DEVICE = 'can0.35'
  // Long enough for a 129285 timer tick (2 s) and two 129284 ticks (1 s)
  const TIMER_WAIT = 2200
  const settle = (ms = 50) => new Promise((resolve) => setTimeout(resolve, ms))
  const sent = (app: any, pgn: number) =>
    app.emitted.filter((msg: { pgn: number }) => msg.pgn === pgn)

  function startPlugin(
    app: any,
    course: () => Course,
    options = {},
    xteOptions = {}
  ) {
    app.sources.can0 = { label: 'can0', type: 'NMEA2000' }
    app.selfData['navigation.course.calcValues'] = {
      distance: { value: 1000 },
      bearingTrue: { value: 0.5 },
      bearingTrackTrue: { value: 0.6 },
      velocityMadeGood: { value: 4 },
      calcMethod: { value: 'Rhumbline' }
    }
    app.courseApi = { getCourse: async () => course() }
    const plugin = require('../dist/index.js')(app, unlimited)
    plugin.start({
      navigationdata: { enabled: true, ...options },
      routewpinformation: { enabled: true, ...options },
      xte: { enabled: true, ...options, ...xteOptions },
      RAYMARINENAV: { enabled: true, ...options }
    })
    return plugin
  }

  // As the Course API emits a course: the course from its own source, the
  // nextPoint with the $source of the source that set it
  function publish(
    app: any,
    course: Course,
    $source: string,
    timestamp = new Date().toISOString()
  ) {
    ;(['activeRoute', 'previousPoint'] as const).forEach((key) =>
      app.buses[`navigation.course.${key}`].push({
        path: `navigation.course.${key}`,
        value: course[key],
        $source: 'courseApi',
        timestamp
      })
    )
    app.buses['navigation.course.nextPoint'].push({
      path: 'navigation.course.nextPoint',
      value: course.nextPoint,
      $source,
      timestamp
    })
    replay(app, [{ $source, timestamp, value: course.nextPoint }])
  }

  // XTE arrives from the server's course calculations, not from NMEA 2000, so
  // only the course origin can hold 129283 back
  function publishXte(app: any) {
    app.buses['navigation.course.calcValues.crossTrackError'].push({
      path: 'navigation.course.calcValues.crossTrackError',
      value: 12,
      $source: 'courseApi'
    })
  }

  // The mock subscription manager has no cache, so a test replays it by hand
  function replay(
    app: any,
    updates: { $source: string; timestamp: string; value: unknown }[]
  ) {
    app.subscribers
      .filter(({ subscription }: Subscriber) =>
        subscription.subscribe.some(
          (row) => row.path === 'navigation.course.nextPoint'
        )
      )
      .forEach(({ callback }: Subscriber) =>
        callback({
          context: 'vessels.urn:mrn:signalk:uuid:test',
          updates: updates.map(({ $source, timestamp, value }) => ({
            $source,
            timestamp,
            values: [{ path: 'navigation.course.nextPoint', value }]
          }))
        })
      )
  }

  it('is not sent, and the course set after it is', async function () {
    this.timeout(5000)
    const app = makeApp()
    let course = goto({ latitude: -35.5, longitude: 138.7 })
    const plugin = startPlugin(app, () => course)
    try {
      publish(app, course, N2K_DEVICE)
      publishXte(app)
      await settle(TIMER_WAIT)
      assert.equal(sent(app, 129285).length, 0, '129285')
      assert.equal(sent(app, 129284).length, 0, '129284')
      assert.equal(sent(app, 129283).length, 0, '129283')
      assert.equal(sent(app, 130848).length, 0, '130848')

      course = goto({ latitude: -35.6, longitude: 138.8 })
      publish(app, course, 'courseApi')
      publishXte(app)
      await settle()
      assert.equal(sent(app, 129285).length, 1, '129285')
      assert.equal(sent(app, 129285)[0].fields.list[1]['WP Latitude'], -35.6)
      assert.isAbove(sent(app, 129284).length, 0, '129284')
      assert.equal(sent(app, 129283).length, 1, '129283')
      assert.isAbove(sent(app, 130848).length, 0, '130848')
    } finally {
      plugin.stop()
    }
  })

  it('is sent while no nextPoint update says where it came from', async function () {
    this.timeout(5000)
    const app = makeApp()
    const course = goto({ latitude: -35.5, longitude: 138.7 })
    // Already active when the plugin starts, with nothing replayed: as on a
    // server with security, or one that does not publish the $source
    const plugin = startPlugin(app, () => course)
    try {
      await settle(TIMER_WAIT)
      assert.isAbove(sent(app, 129285).length, 0, '129285')
      assert.isAbove(sent(app, 129284).length, 0, '129284')
    } finally {
      plugin.stop()
    }
  })

  it('stops a resend once the course turns out to come from NMEA 2000', async () => {
    const app = makeApp()
    let course = goto({ latitude: -35.5, longitude: 138.7 })
    const plugin = startPlugin(
      app,
      () => course,
      {},
      { resend: 0.1, resendTime: 30 }
    )
    try {
      publish(app, course, 'courseApi')
      publishXte(app)
      await settle(250)
      assert.isAbove(sent(app, 129283).length, 1, 'resent')

      course = goto({ latitude: -35.6, longitude: 138.8 })
      publish(app, course, N2K_DEVICE)
      await settle()
      const before = sent(app, 129283).length
      await settle(300)
      assert.equal(sent(app, 129283).length, before)
    } finally {
      plugin.stop()
    }
  })

  it('sends the cross track error from a source picked for it', async () => {
    const app = makeApp()
    const course = goto({ latitude: -35.5, longitude: 138.7 })
    const plugin = startPlugin(
      app,
      () => course,
      {},
      { navigationcoursecalcValuescrossTrackError: 'courseApi' }
    )
    try {
      publish(app, course, N2K_DEVICE)
      publishXte(app)
      await settle()
      assert.equal(sent(app, 129283).length, 1)
    } finally {
      plugin.stop()
    }
  })

  it('is sent when the conversions allow NMEA 2000 sources', async () => {
    const app = makeApp()
    const course = goto({ latitude: -35.5, longitude: 138.7 })
    const plugin = startPlugin(app, () => course, {
      allowNmea2000Sources: true
    })
    try {
      publish(app, course, N2K_DEVICE)
      await settle()
      assert.equal(sent(app, 129285).length, 1, '129285')
      assert.equal(sent(app, 129284).length, 1, '129284')
    } finally {
      plugin.stop()
    }
  })

  it('does not hold back a later course when the cache replays both', async function () {
    this.timeout(5000)
    const app = makeApp()
    const course = goto({ latitude: -35.5, longitude: 138.7 })
    const plugin = startPlugin(app, () => course)
    try {
      // The server replays its cache oldest first
      const now = Date.now()
      replay(app, [
        {
          $source: N2K_DEVICE,
          timestamp: new Date(now - 60000).toISOString(),
          value: course.nextPoint
        },
        {
          $source: 'courseApi',
          timestamp: new Date(now).toISOString(),
          value: course.nextPoint
        }
      ])
      await settle(TIMER_WAIT)
      assert.isAbove(sent(app, 129285).length, 0, '129285')
      assert.isAbove(sent(app, 129284).length, 0, '129284')
    } finally {
      plugin.stop()
    }
  })
})

// A course as the Course API gives it
type Course = ReturnType<typeof goto>

function goto(destination: { latitude: number; longitude: number }) {
  return {
    activeRoute: null,
    previousPoint: {
      type: 'VesselPosition',
      position: { latitude: -35.45, longitude: 138.0 }
    },
    nextPoint: { type: 'Location', name: 'DP', position: destination }
  }
}

describe('man overboard', function () {
  const mob = (value: unknown) => ({
    context: 'vessels.self',
    updates: [{ values: [{ path: 'notifications.mob.1', value }] }]
  })
  const sentMobs = (app: any) =>
    app.emitted.filter((pgn: TestPgn) => pgn.pgn === 127233)

  it('leaves repeating to its timer, not the resend option', async function () {
    // A resent snapshot would outlast the MOB it shows
    const app = makeApp()
    const plugin = require('../dist/index.js')(app, unlimited)
    plugin.start({ MOB: { enabled: true, resend: 0.02 } })
    try {
      app.subscribers.forEach((subscriber: Subscriber) =>
        subscriber.callback(mob({ state: 'emergency', createdAt: new Date() }))
      )
      await settle()
      assert.equal(sentMobs(app).length, 1)
    } finally {
      plugin.stop()
    }
  })

  it('takes the activation time from the update without a createdAt', async function () {
    const app = makeApp()
    const plugin = require('../dist/index.js')(app, unlimited)
    plugin.start({ MOB: { enabled: true } })
    const raise = (timestamp: string, createdAt?: string) => ({
      context: 'vessels.self',
      updates: [
        {
          timestamp,
          values: [
            {
              path: 'notifications.mob',
              value: {
                state: 'emergency',
                position: { latitude: 52.37, longitude: 4.89 },
                createdAt
              }
            }
          ]
        }
      ]
    })
    try {
      const [subscriber] = app.subscribers
      subscriber.callback(raise('2026-11-05T18:30:15.000Z'))
      // A later update of the same MOB keeps the time it was raised, even
      // one with a createdAt
      subscriber.callback(raise('2026-11-05T18:30:45.000Z'))
      subscriber.callback(
        raise('2026-11-05T18:31:15.000Z', '2026-11-05T18:31:15.000Z')
      )
      await settle()
      const sent = sentMobs(app)
      assert.equal(sent.length, 3)
      sent.forEach((pgn: TestPgn) => {
        assert.equal(pgn.fields['Activation Time'], 66615)
        assert.equal(pgn.fields['Position Date'], '2026.11.05')
        assert.equal(pgn.fields['Position Time'], 66615)
      })
    } finally {
      plugin.stop()
    }
  })

  it('sends a cleared MOB as not active for ten seconds', async function () {
    const clock = sinon.useFakeTimers({
      now: Date.now(),
      toFake: ['Date', 'setInterval', 'clearInterval']
    })
    const app = makeApp()
    const plugin = require('../dist/index.js')(app, unlimited)
    plugin.start({ MOB: { enabled: true } })
    try {
      const [subscriber] = app.subscribers
      subscriber.callback(mob({ state: 'emergency', createdAt: new Date() }))
      subscriber.callback(mob(null))
      await clock.tickAsync(0)
      const status = () => sentMobs(app).at(-1).fields['Man Overboard Status']
      assert.equal(status(), 'MOB Not Active')

      // A device that misses one message must still learn it is over, so
      // the timer repeats it every second for ten seconds, and then stops
      for (let second = 1; second <= 10; second++) {
        const before = sentMobs(app).length
        await clock.tickAsync(1000)
        assert.equal(sentMobs(app).length, before + 1, `at ${second} s`)
        assert.equal(status(), 'MOB Not Active')
      }
      const over = sentMobs(app).length
      await clock.tickAsync(3000)
      assert.equal(sentMobs(app).length, over)
    } finally {
      plugin.stop()
      clock.restore()
    }
  })
})
