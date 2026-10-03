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
      // The plugin sends Actisense lines; keep them decoded.
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
})
