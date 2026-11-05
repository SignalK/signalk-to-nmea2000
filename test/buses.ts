const Bacon = require('baconjs')
import chai from 'chai'
const assert: Chai.AssertStatic = chai.assert

// Sending to chosen NMEA 2000 buses (#194). A server that can send to one bus
// lists each NMEA 2000 connection that writes in the pipedprovider property
// value; the plugin emits a PGN for a chosen bus on that bus's own event.

const pipedprovider = (value: Record<string, unknown>) => ({
  timestamp: 0,
  setter: String(value.id),
  name: 'pipedprovider',
  value
})

const bus = (id: string, broadcast = true) =>
  pipedprovider({
    id,
    type: 'NMEA2000YD',
    eventNames: {
      received: `received:${id}`,
      nmea2000out: `nmea2000out:${id}`,
      nmea2000JsonOut: `nmea2000JsonOut:${id}`
    },
    broadcast
  })

// The property values of a server with buses bus1 and bus2, an NMEA 0183
// connection, and an NMEA 2000 connection that only reads
const SERVER_BUSES = [
  undefined,
  bus('bus1'),
  pipedprovider({ id: 'gps', type: 'NMEA0183' }),
  bus('bus2', false),
  pipedprovider({ id: 'reader', type: 'NMEA2000' })
]

function makeApp(propertyValues?: unknown[]): any {
  const errors: string[] = []
  const events: string[] = []
  const selfBuses: Record<string, any> = {}
  return {
    errors,
    events,
    selfBuses,
    debug: Object.assign(() => {}, { enabled: false }),
    error: (message: string) => errors.push(message),
    emit: (event: string) => events.push(event),
    getSelfPath: () => undefined,
    getPath: () => undefined,
    signalk: { self: {}, on: () => {} },
    ...(propertyValues
      ? {
          onPropertyValues: (name: string, cb: (values: unknown[]) => void) => {
            if (name === 'pipedprovider') cb(propertyValues)
            return () => {}
          }
        }
      : {}),
    streambundle: {
      getSelfBus: (path: string) =>
        (selfBuses[path] = selfBuses[path] || new Bacon.Bus())
    }
  }
}

// Starts the rudder conversion with these options, sends one angle and gives
// the events its PGN went out on
async function rudderEvents(
  app: any,
  options: Record<string, unknown>
): Promise<string[]> {
  const plugin = require('../dist/index.js')(app)
  plugin.start({ RUDDER: { enabled: true }, ...options })
  app.selfBuses['steering.rudderAngle'].push({
    path: 'steering.rudderAngle',
    value: 0.1,
    $source: 'test.1'
  })
  await new Promise((resolve) => setTimeout(resolve, 50))
  plugin.stop()
  return app.events
}

describe('NMEA 2000 buses', function () {
  it('offers no bus choice on a server that lists no buses', function () {
    const schema = require('../dist/index.js')(makeApp()).schema()
    assert.notProperty(schema.properties, 'OUTPUT')
    assert.notProperty(schema.properties.RUDDER.properties, 'nmea2000Buses')
  })

  it('offers the NMEA 2000 connections that write', function () {
    const schema = require('../dist/index.js')(makeApp(SERVER_BUSES)).schema()
    const output = schema.properties.OUTPUT.properties.nmea2000Buses
    assert.deepEqual(output.items.enum, ['bus1', 'bus2'])
    assert.isTrue(output.uniqueItems)
    const rudder = schema.properties.RUDDER.properties.nmea2000Buses
    assert.deepEqual(rudder.items.enum, ['bus1', 'bus2'])
  })

  it('keeps a saved bus that is not listed now a choice', function () {
    const app = makeApp(SERVER_BUSES)
    app.readPluginOptions = () => ({
      enabled: true,
      configuration: {
        OUTPUT: { nmea2000Buses: ['old'] },
        RUDDER: { enabled: true, nmea2000Buses: ['bus1', 'gone'] }
      }
    })
    const schema = require('../dist/index.js')(app).schema()
    assert.deepEqual(
      schema.properties.OUTPUT.properties.nmea2000Buses.items.enum,
      ['bus1', 'bus2', 'old', 'gone']
    )
  })

  it('sends to every bus when none is chosen', async function () {
    const events = await rudderEvents(makeApp(SERVER_BUSES), {})
    assert.deepEqual(events, ['nmea2000out'])
  })

  it('sends to the buses chosen for every conversion', async function () {
    const events = await rudderEvents(makeApp(SERVER_BUSES), {
      OUTPUT: { nmea2000Buses: ['bus1', 'bus2'] }
    })
    assert.deepEqual(events, ['nmea2000out:bus1', 'nmea2000out:bus2'])
  })

  it("sends to a conversion's own choice instead", async function () {
    const events = await rudderEvents(makeApp(SERVER_BUSES), {
      OUTPUT: { nmea2000Buses: ['bus1'] },
      RUDDER: { enabled: true, nmea2000Buses: ['bus2'] }
    })
    assert.deepEqual(events, ['nmea2000out:bus2'])
  })

  it('sends to a chosen bus that is not listed yet', async function () {
    // The connection may start after the others
    const app = makeApp(SERVER_BUSES)
    const events = await rudderEvents(app, {
      RUDDER: { enabled: true, nmea2000Buses: ['bus9'] }
    })
    assert.deepEqual(events, ['nmea2000out:bus9'])
    assert.isEmpty(app.errors)
  })

  it('sends to every bus when the server lists none', async function () {
    // Bus choices saved on a server that could send to one bus
    for (const propertyValues of [undefined, [undefined]]) {
      const events = await rudderEvents(makeApp(propertyValues), {
        OUTPUT: { nmea2000Buses: ['bus1'] },
        RUDDER: { enabled: true, nmea2000Buses: ['bus2'] }
      })
      assert.deepEqual(events, ['nmea2000out'])
    }
  })

  it('sends to a bus chosen twice once', async function () {
    const events = await rudderEvents(makeApp(SERVER_BUSES), {
      OUTPUT: { nmea2000Buses: ['bus1', 'bus1'] }
    })
    assert.deepEqual(events, ['nmea2000out:bus1'])
  })
})
