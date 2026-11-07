const Bacon = require('baconjs')
import chai from 'chai'
const assert: Chai.AssertStatic = chai.assert

// The plugin's schema is built with TypeBox (#200). The admin UI renders it
// as a form, so it must stay the JSON Schema it was; plugin.start fills in
// its defaults and reports settings that do not match it.

function makeApp(self: Record<string, any> = {}): any {
  const errors: string[] = []
  const subscribed: string[] = []
  const get = (path: string) =>
    path.split('.').reduce((node, key) => node?.[key], self)
  return {
    errors,
    subscribed,
    debug: Object.assign(() => {}, { enabled: false }),
    error: (message: string) => errors.push(message),
    emit: () => {},
    getSelfPath: get,
    getPath: () => undefined,
    signalk: { self, on: () => {} },
    streambundle: {
      getSelfBus: (path: string) => {
        subscribed.push(path)
        return new Bacon.Bus()
      }
    }
  }
}

describe('plugin settings', function () {
  it('gives each conversion the shared settings, its sources and its own', function () {
    const plugin = require('../dist/index.js')(makeApp())
    const rudder = plugin.schema().properties.RUDDER
    assert.equal(rudder.type, 'object')
    assert.equal(rudder.title, 'Rudder (127245)')
    assert.deepEqual(Object.keys(rudder.properties), [
      'enabled',
      'resend',
      'resendTime',
      'allowNmea2000Sources',
      'steeringrudderAngle',
      'instance'
    ])
    // Nothing is required: a setting left out takes its default
    assert.notProperty(rudder, 'required')
    assert.notProperty(plugin.schema(), 'required')
  })

  it('keeps the required fields of a solar charger mapping', function () {
    const plugin = require('../dist/index.js')(
      makeApp({ electrical: { solar: { roof: {} } } })
    )
    const charger = plugin.schema().properties.SOLAR.properties.chargers.items
    assert.deepEqual(charger.required, [
      'signalkId',
      'instanceId',
      'panelInstanceId'
    ])
    assert.deepEqual(charger.properties.signalkId.examples, ['roof'])
  })

  it('offers the sources of the battery data, except NMEA 2000 ones', function () {
    const app = makeApp({
      electrical: {
        batteries: {
          meta: { description: 'not a battery' },
          house: {
            voltage: {
              value: 12.5,
              $source: 'venus.II',
              values: {
                'venus.II': { value: 12.5 },
                'bmv.II': { value: 12.6 },
                'can0.35': { value: 12.7 }
              }
            },
            capacity: { stateOfCharge: { value: 0.9, $source: 'shunt.II' } }
          },
          start: { voltage: { value: 12.8, $source: 'venus.II' } }
        }
      }
    })
    app.getPath = (path: string) =>
      path === 'sources'
        ? { can0: { type: 'NMEA2000' }, venus: { type: 'NMEA0183' } }
        : undefined
    const plugin = require('../dist/index.js')(app)
    const battery =
      plugin.schema().properties.BATTERYv2.properties.batteries.items
    assert.deepEqual(battery.properties.signalkId.examples, ['house', 'start'])
    assert.deepEqual(battery.properties.source.examples, [
      'bmv.II',
      'shunt.II',
      'venus.II'
    ])
  })

  it('offers no battery sources without battery data', function () {
    const plugin = require('../dist/index.js')(makeApp())
    const battery =
      plugin.schema().properties.BATTERYv2.properties.batteries.items
    assert.deepEqual(battery.properties.source.examples, [])
  })

  it('offers the temperature paths in the Signal K data', function () {
    const plugin = require('../dist/index.js')(
      makeApp({
        environment: {
          inside: {
            fridge: {
              temperature: { value: 277, meta: { units: 'K' } }
            }
          }
        },
        propulsion: { port: { temperature: { value: 350 } } }
      })
    )
    const temperature =
      plugin.schema().properties.TEMPERATURE_PATHS.properties.temperatures.items
    assert.deepEqual(temperature.properties.path.examples, [
      'environment.inside.fridge.temperature',
      'propulsion.port.temperature'
    ])
  })

  it('offers the tank paths in the Signal K data', function () {
    const plugin = require('../dist/index.js')(
      makeApp({ tanks: { fuel: { port: {} }, freshWater: { 0: {} } } })
    )
    const tank = plugin.schema().properties.TANKS.properties.tanks.items
    assert.deepEqual(tank.properties.signalkPath.enum, [
      'tanks.fuel.port',
      'tanks.freshWater.0'
    ])
  })

  it('fills in the defaults of an enabled conversion', function () {
    const plugin = require('../dist/index.js')(makeApp())
    const options: Record<string, any> = { RUDDER: { enabled: true } }
    plugin.start(options)
    plugin.stop()
    assert.deepEqual(options.RUDDER, {
      enabled: true,
      resend: 0,
      resendTime: 30,
      allowNmea2000Sources: false,
      instance: 0
    })
  })

  it('reports a setting that does not match the schema, and still starts', function () {
    const app = makeApp()
    const plugin = require('../dist/index.js')(app)
    const options = { RUDDER: { enabled: true, instance: 300 } }
    plugin.start(options)
    plugin.stop()
    assert.lengthOf(app.errors, 1)
    assert.match(app.errors[0], /^Rudder \(127245\): setting \/instance /)
    assert.include(app.subscribed, 'steering.rudderAngle')
  })

  it('does not check a tank path against the tanks that have reported', function () {
    const app = makeApp({ tanks: { fuel: { port: {} } } })
    const plugin = require('../dist/index.js')(app)
    plugin.start({
      TANKS: {
        enabled: true,
        tanks: [{ signalkPath: 'tanks.fuel.starboard', instanceId: 1 }]
      }
    })
    plugin.stop()
    assert.deepEqual(app.errors, [])
  })

  it('skips a tank mapping without a path', function () {
    const app = makeApp()
    const plugin = require('../dist/index.js')(app)
    plugin.start({
      TANKS: {
        enabled: true,
        tanks: [{}, { signalkPath: 'tanks.fuel.port', instanceId: 1 }]
      }
    })
    plugin.stop()
    assert.deepEqual(app.subscribed, [
      'tanks.fuel.port.currentLevel',
      'tanks.fuel.port.capacity'
    ])
  })

  it('leaves a disabled conversion alone', function () {
    const app = makeApp()
    const plugin = require('../dist/index.js')(app)
    const options = { RUDDER: { enabled: false, instance: 'one' } }
    plugin.start(options)
    plugin.stop()
    assert.deepEqual(options.RUDDER, { enabled: false, instance: 'one' })
    assert.deepEqual(app.errors, [])
  })
})
