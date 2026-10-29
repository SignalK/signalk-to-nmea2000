const { FromPgn } = require('@canboat/canboatjs')
const Bacon = require('baconjs')
const chai = require('chai')
const assert = chai.assert
const sinon = require('sinon')

// Runs the plugin against a mock app whose streambundle hands out real Bacon
// buses, the same way the server's StreamBundle does. Guards the
// onValueChange path in index.js (timeoutingArrayStream), which is not
// covered by the per-conversion tests.
function makeApp({ selfData = {}, sources = {} } = {}) {
  const buses = {}
  const emitted = []
  const debugMessages = []
  const debug = (message) => debugMessages.push(message)
  const subscribers = []
  const debug = () => {}
  debug.enabled = false
  const initialSelfData = {
    'environment.depth.surfaceToTransducer.value': 1,
    ...selfData
  }
  const sources = {}
  return {
    emitted,
    buses,
    debugMessages,
    debug,
    error: () => {},
    getSelfPath: (p) => initialSelfData[p],
    getPath: (p) => p === '/sources' ? sources : undefined,
    subscribers,
    selfData,
    sources,
    debug,
    error: () => {},
    getSelfPath: (p) => selfData[p],
    getPath: (p) => (p === 'sources' ? sources : undefined),
    subscriptionmanager: {
      subscribe: (subscription, unsubscribes, onError, callback) => {
        subscribers.push({ subscription, callback })
      }
    },
    signalk: { self: {}, on: () => {} },
    selfId: 'urn:mrn:signalk:uuid:test',
    emit: (event, pgn) => {
      if (event === 'nmea2000out') {
        emitted.push(new FromPgn({ useCamel: false }).parseString(pgn))
      }
    },
    streambundle: {
      getSelfBus: (path) => {
        if (!buses[path]) {
          buses[path] = new Bacon.Bus()
        }
        return buses[path]
      }
    }
  }
}

function startEngineParameters(app, engine = { signalkId: 'engines.port', instanceId: 0 }, extraOptions = {}) {
  const plugin = require('../index.js')(app)
  plugin.start({
    ENGINE_PARAMETERS: {
      enabled: true,
      engines: [engine],
      ...extraOptions
    }
  })
  return plugin
}

function publish(app, path, value, sourceId = 'test.1', source = {}) {
  app.buses[path].push({ path, value, $source: sourceId, source })
}

const settle = () => new Promise(resolve => setTimeout(resolve, 50))

describe('onValueChange conversions over the streambundle', () => {
  it('emits a PGN from values pushed onto a self bus', async () => {
    const app = makeApp()
    app.debug.enabled = true
    const plugin = require('../index.js')(app)
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
    assert.isTrue(app.debugMessages.some((message) =>
      message.startsWith('emit nmea2000out ') && message.includes(',2,128267,')
    ))
    assert.isTrue(app.debugMessages.some((message) =>
      message === 'emit nmea2000JsonOut {"pgn":128267,"SID":255,"Depth":4.5,"Offset":1}'
    ))
  })

  it('uses the Signal K engine notification paths for all discrete status fields', async () => {
    const app = makeApp()
    const plugin = startEngineParameters(app)
    const active = { state: 'alarm' }
    publish(app, 'notifications.propulsion.engines.port.eGRSystem', active)
    publish(app, 'notifications.propulsion.engines.port.emergencyStopMode', active)
    publish(app, 'notifications.propulsion.engines.port.commError', active)
    publish(app, 'notifications.propulsion.engines.port.shuttingDown', active)

    await settle()
    plugin.stop()

    const enginePgn = app.emitted.find(pgn => pgn.pgn === 127489)
    assert.exists(enginePgn)
    assert.deepEqual(enginePgn.fields['Discrete Status 1'], ['EGR System', 'Emergency Stop'])
    assert.deepEqual(enginePgn.fields['Discrete Status 2'], ['Engine Comm Error', 'Engine Shutting Down'])
  })

  it('does not set an engine status bit for a nominal notification', async () => {
    const app = makeApp()
    const plugin = startEngineParameters(app)
    publish(app, 'notifications.propulsion.engines.port.lowOilPressure', { state: 'nominal' })

    await settle()
    plugin.stop()

    const enginePgn = app.emitted.find(pgn => pgn.pgn === 127489)
    assert.exists(enginePgn)
    assert.deepEqual(enginePgn.fields['Discrete Status 1'], [])
  })

  it('clears an active notification on normal and null updates', async () => {
    const app = makeApp()
    const plugin = startEngineParameters(app)
    const notificationPath = 'notifications.propulsion.engines.port.checkEngine'
    publish(app, notificationPath, { state: 'alarm' })
    await settle()
    publish(app, notificationPath, { state: 'normal' })
    await settle()
    publish(app, notificationPath, null)
    await settle()
    plugin.stop()

    const enginePgns = app.emitted.filter(pgn => pgn.pgn === 127489)
    assert.deepEqual(enginePgns[0].fields['Discrete Status 1'], ['Check Engine'])
    assert.deepEqual(enginePgns[enginePgns.length - 1].fields['Discrete Status 1'], [])
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
      let enginePgn = app.emitted.find(pgn => pgn.pgn === 127489)
      assert.exists(enginePgn)
      assert.deepEqual(enginePgn.fields['Discrete Status 1'], ['Check Engine'])

      clock.tick(11000)
      publish(app, 'propulsion.engines.port.oilPressure', 120000)
      await settle()

      enginePgn = app.emitted.filter(pgn => pgn.pgn === 127489).pop()
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
          $source: 'other-controller'
        }
      }
    })
    const plugin = startEngineParameters(app, undefined, {
      [notificationPath.replace(/\./g, '')]: 'selected-controller'
    })

    publish(app, 'propulsion.engines.port.oilPressure', 120000)
    await settle()
    let enginePgn = app.emitted.filter(pgn => pgn.pgn === 127489).pop()
    assert.exists(enginePgn)
    assert.deepEqual(enginePgn.fields['Discrete Status 1'], [])

    publish(app, notificationPath, { state: 'alarm' }, 'selected-controller')
    await settle()
    plugin.stop()

    enginePgn = app.emitted.filter(pgn => pgn.pgn === 127489).pop()
    assert.deepEqual(enginePgn.fields['Discrete Status 1'], ['Check Engine'])
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
        'n2k.100': { type: 'NMEA2000' }
      }
    })
    const plugin = startEngineParameters(app)
    publish(
      app,
      notificationPath,
      { state: 'alarm' },
      'n2k.100',
      { type: 'NMEA2000' }
    )
    publish(
      app,
      'propulsion.engines.port.oilPressure',
      120000,
      'sensor.1',
      { type: 'Signal K' }
    )

    await settle()
    plugin.stop()

    const enginePgn = app.emitted.find(pgn => pgn.pgn === 127489)
    assert.exists(enginePgn)
    assert.deepEqual(enginePgn.fields['Discrete Status 1'], [])
  })

  it('sends 129285 as soon as the course changes, once per change', async () => {
    const app = makeApp()
    let course = goto({ latitude: -35.5, longitude: 138.7 })
    app.courseApi = { getCourse: async () => course }
    const plugin = require('../index.js')(app)
    plugin.start({ routewpinformation: { enabled: true } })

    const publish = () =>
      ['activeRoute', 'nextPoint', 'previousPoint'].forEach((key) =>
        app.buses[`navigation.course.${key}`].push({
          path: `navigation.course.${key}`,
          value: course[key],
          $source: 'courseApi'
        })
      )
    const settle = () => new Promise((resolve) => setTimeout(resolve, 50))
    const routeInfo = () => app.emitted.filter((pgn) => pgn.pgn === 129285)
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
  const sent = (app, pgn) => app.emitted.filter((msg) => msg.pgn === pgn)

  function startPlugin(app, course, options = {}, xteOptions = {}) {
    app.sources.can0 = { label: 'can0', type: 'NMEA2000' }
    app.selfData['navigation.course.calcValues'] = {
      distance: { value: 1000 },
      bearingTrue: { value: 0.5 },
      bearingTrackTrue: { value: 0.6 },
      velocityMadeGood: { value: 4 },
      calcMethod: { value: 'Rhumbline' }
    }
    app.courseApi = { getCourse: async () => course() }
    const plugin = require('../index.js')(app)
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
  function publish(app, course, $source, timestamp = new Date().toISOString()) {
    ;['activeRoute', 'previousPoint'].forEach((key) =>
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
  function publishXte(app) {
    app.buses['navigation.course.calcValues.crossTrackError'].push({
      path: 'navigation.course.calcValues.crossTrackError',
      value: 12,
      $source: 'courseApi'
    })
  }

  // The mock subscription manager has no cache, so a test replays it by hand
  function replay(app, updates) {
    app.subscribers
      .filter(({ subscription }) =>
        subscription.subscribe.some((row) => row.path === 'navigation.course.nextPoint'))
      .forEach(({ callback }) => callback({
        context: 'vessels.urn:mrn:signalk:uuid:test',
        updates: updates.map(({ $source, timestamp, value }) => ({
          $source,
          timestamp,
          values: [{ path: 'navigation.course.nextPoint', value }]
        }))
      }))
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
    const plugin = startPlugin(app, () => course, {}, { resend: 0.1, resendTime: 30 })
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
    const plugin = startPlugin(app, () => course, {},
      { navigationcoursecalcValuescrossTrackError: 'courseApi' })
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
    const plugin = startPlugin(app, () => course, { allowNmea2000Sources: true })
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
        { $source: N2K_DEVICE, timestamp: new Date(now - 60000).toISOString(), value: course.nextPoint },
        { $source: 'courseApi', timestamp: new Date(now).toISOString(), value: course.nextPoint }
      ])
      await settle(TIMER_WAIT)
      assert.isAbove(sent(app, 129285).length, 0, '129285')
      assert.isAbove(sent(app, 129284).length, 0, '129284')
    } finally {
      plugin.stop()
    }
  })
})

function goto(destination) {
  return {
    activeRoute: null,
    previousPoint: {
      type: 'VesselPosition',
      position: { latitude: -35.45, longitude: 138.0 }
    },
    nextPoint: { type: 'Location', name: 'DP', position: destination }
  }
}
