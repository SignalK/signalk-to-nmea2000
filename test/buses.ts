const Bacon = require('baconjs')
const _ = require('lodash')
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
  pipedprovider({ id: 'reader', type: 'NMEA2000' }),
  bus('bus3')
]

function makeApp(propertyValues?: unknown[]): any {
  const errors: string[] = []
  const events: string[] = []
  const selfBuses: Record<string, any> = {}
  const deltaHandlers: ((delta: any) => void)[] = []
  return {
    deltaHandlers,
    errors,
    events,
    selfBuses,
    debug: Object.assign(() => {}, { enabled: false }),
    error: (message: string) => errors.push(message),
    emit: (event: string) => events.push(event),
    getSelfPath: () => undefined,
    getPath: () => undefined,
    selfId: 'urn:mrn:signalk:uuid:self',
    signalk: {
      self: {},
      on: (event: string, handler: (delta: any) => void) => {
        if (event === 'delta') deltaHandlers.push(handler)
      }
    },
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

// Where a value came from: a $source starts with the connection's id
const fromBus = (id: string) => ({
  $source: `${id}.35`,
  source: { type: 'NMEA2000', label: id }
})

// Starts the rudder conversion with these options, sends one angle and gives
// the events its PGN went out on
async function rudderEvents(
  app: any,
  options: Record<string, unknown>,
  from: Record<string, unknown> = { $source: 'test.1' }
): Promise<string[]> {
  const plugin = require('../dist/index.js')(app)
  plugin.start({ RUDDER: { enabled: true }, ...options })
  app.selfBuses['steering.rudderAngle'].push({
    path: 'steering.rudderAngle',
    value: 0.1,
    ...from
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
    assert.deepEqual(output.items.enum, ['bus1', 'bus2', 'bus3'])
    assert.isFalse(schema.properties.OUTPUT.properties.bridgeNmea2000.default)
    assert.isTrue(output.uniqueItems)
    const rudder = schema.properties.RUDDER.properties.nmea2000Buses
    assert.deepEqual(rudder.items.enum, ['bus1', 'bus2', 'bus3'])
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
      ['bus1', 'bus2', 'bus3', 'old', 'gone']
    )
  })

  it('shows the bus choices as checkboxes', function () {
    const uiSchema = require('../dist/index.js')(
      makeApp(SERVER_BUSES)
    ).uiSchema()
    const checkboxes = { 'ui:widget': 'checkboxes' }
    assert.deepEqual(uiSchema.OUTPUT.nmea2000Buses, checkboxes)
    assert.deepEqual(uiSchema.RUDDER.nmea2000Buses, checkboxes)
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

  describe('bridging', function () {
    const BRIDGE = { OUTPUT: { bridgeNmea2000: true } }

    it('withholds NMEA 2000 data unless bridging is on', async function () {
      const events = await rudderEvents(
        makeApp(SERVER_BUSES),
        {},
        fromBus('bus1')
      )
      assert.isEmpty(events)
    })

    it('sends NMEA 2000 data to every other bus that takes broadcasts', async function () {
      // bus2 takes only what is sent to it by name
      const events = await rudderEvents(
        makeApp(SERVER_BUSES),
        BRIDGE,
        fromBus('bus1')
      )
      assert.deepEqual(events, ['nmea2000out:bus3'])
    })

    it('sends NMEA 2000 data to the other chosen buses', async function () {
      const events = await rudderEvents(
        makeApp(SERVER_BUSES),
        { OUTPUT: { bridgeNmea2000: true, nmea2000Buses: ['bus1', 'bus2'] } },
        fromBus('bus1')
      )
      assert.deepEqual(events, ['nmea2000out:bus2'])
    })

    it('sends other data to every bus as before', async function () {
      const events = await rudderEvents(makeApp(SERVER_BUSES), BRIDGE)
      assert.deepEqual(events, ['nmea2000out'])
    })

    it('withholds NMEA 2000 data on a server that lists no buses', async function () {
      const events = await rudderEvents(makeApp(), BRIDGE, fromBus('bus1'))
      assert.isEmpty(events)
    })

    it('sends AIS from one bus to the others', async function () {
      const app = makeApp(SERVER_BUSES)
      app.getPath = () => undefined
      const plugin = require('../dist/index.js')(app)
      plugin.start({ ...BRIDGE, AISv2: { enabled: true } })
      const ais = (from: Record<string, unknown>) => ({
        context: 'vessels.urn:mrn:imo:mmsi:235000001',
        updates: [
          {
            ...from,
            values: [
              {
                path: 'navigation.position',
                value: { longitude: 4.1, latitude: 52.2 }
              },
              { path: '', value: { mmsi: '235000001' } }
            ]
          }
        ]
      })
      app.deltaHandlers.forEach((handler: any) => {
        handler(ais(fromBus('bus3')))
        handler(ais({ $source: 'ais.1' }))
      })
      await new Promise((resolve) => setTimeout(resolve, 50))
      plugin.stop()
      // From bus3: to bus1 only; from elsewhere: to every bus
      assert.deepEqual(app.events, ['nmea2000out:bus1', 'nmea2000out'])
    })

    const aisDelta = (updates: Record<string, unknown>[]) => ({
      context: 'vessels.urn:mrn:imo:mmsi:235000001',
      updates
    })
    const aisPosition = [
      {
        path: 'navigation.position',
        value: { longitude: 4.1, latitude: 52.2 }
      },
      { path: '', value: { mmsi: '235000001' } }
    ]

    it('withholds NMEA 2000 data whose bus is not known', async function () {
      const app = makeApp(SERVER_BUSES)
      const plugin = require('../dist/index.js')(app)
      plugin.start({ ...BRIDGE, AISv2: { enabled: true } })
      app.deltaHandlers.forEach((handler: any) =>
        handler(
          aisDelta([{ source: { type: 'NMEA2000' }, values: aisPosition }])
        )
      )
      await new Promise((resolve) => setTimeout(resolve, 50))
      plugin.stop()
      assert.isEmpty(app.events)
    })

    it('withholds NMEA 2000 data from a connection that only reads', async function () {
      // It may be a second gateway on a bus that is listed
      const events = await rudderEvents(
        makeApp(SERVER_BUSES),
        BRIDGE,
        fromBus('reader')
      )
      assert.isEmpty(events)

      const app = makeApp(SERVER_BUSES)
      const plugin = require('../dist/index.js')(app)
      plugin.start({ ...BRIDGE, AISv2: { enabled: true } })
      app.deltaHandlers.forEach((handler: any) =>
        handler(aisDelta([{ ...fromBus('reader'), values: aisPosition }]))
      )
      await new Promise((resolve) => setTimeout(resolve, 50))
      plugin.stop()
      assert.isEmpty(app.events)
    })

    it('keeps resending when another bus in the delta gives nothing', async function () {
      const app = makeApp(SERVER_BUSES)
      const plugin = require('../dist/index.js')(app)
      plugin.start({ ...BRIDGE, AISv2: { enabled: true, resend: 0.02 } })
      app.deltaHandlers.forEach((handler: any) =>
        handler(
          aisDelta([
            { $source: 'ais.1', values: aisPosition },
            {
              ...fromBus('bus3'),
              values: [{ path: 'design.draft', value: { maximum: 2 } }]
            }
          ])
        )
      )
      await new Promise((resolve) => setTimeout(resolve, 70))
      plugin.stop()
      assert.isAbove(app.events.length, 1)
      assert.deepEqual(_.uniq(app.events), ['nmea2000out'])
    })

    it('does not bridge a PGN that follows the course', async function () {
      // A conversion with a withheld function is not bridged: its NMEA 2000
      // input withholds the PGN instead of sending it to the other buses
      const app = makeApp(SERVER_BUSES)
      app.subscriptionmanager = { subscribe: () => {} }
      const plugin = require('../dist/index.js')(app)
      plugin.start({ ...BRIDGE, xte: { enabled: true } })
      app.selfBuses['navigation.course.calcValues.crossTrackError'].push({
        path: 'navigation.course.calcValues.crossTrackError',
        value: 0.1,
        ...fromBus('bus1')
      })
      await new Promise((resolve) => setTimeout(resolve, 50))
      plugin.stop()
      assert.isEmpty(app.events)
    })
  })
})
