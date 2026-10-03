const { FromPgn } = require('@canboat/canboatjs')
const Bacon = require('baconjs')
const chai = require('chai')
const assert = chai.assert

// Runs the plugin against a mock app whose streambundle hands out real Bacon
// buses, the same way the server's StreamBundle does. Guards the
// onValueChange path in index.js (timeoutingArrayStream), which is not
// covered by the per-conversion tests.
function makeApp() {
  const buses = {}
  const emitted = []
  const debug = () => {}
  debug.enabled = false
  const selfData = {
    'environment.depth.surfaceToTransducer.value': 1
  }
  return {
    emitted,
    buses,
    debug,
    error: () => {},
    getSelfPath: (p) => selfData[p],
    getPath: () => undefined,
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

describe('onValueChange conversions over the streambundle', () => {
  it('emits a PGN from values pushed onto a self bus', async () => {
    const app = makeApp()
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

    try {
      publish()
      await settle()
      assert.equal(routeInfo().length, 1)

      publish()
      await settle()
      assert.equal(routeInfo().length, 1, 'an unchanged course is not resent')

      course = goto({ latitude: -35.6, longitude: 138.8 })
      publish()
      await settle()
      assert.equal(routeInfo().length, 2)
      assert.equal(routeInfo()[1].fields.list[1]['WP Latitude'], -35.6)
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
