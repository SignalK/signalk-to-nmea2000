import { FromPgn } from '@canboat/canboatjs'
import {
  PGN_127250,
  PGN_127505,
  PGN_127508,
  PGN_129038,
  PGN_130312,
  DirectionReference,
  TankType,
  TemperatureSource
} from '@canboat/ts-pgns'
import chai from 'chai'
const assert: Chai.AssertStatic = chai.assert
import sinon from 'sinon'

const { rateLimiter, streamOf } = require('../dist/rateLimit')
const Sk2n2K = require('../dist')
const Server = require('signalk-server/dist/')

const battery = (instance: number, voltage: number) =>
  new PGN_127508({ instance, voltage })

describe('rate limit', () => {
  describe('the stream of a PGN', () => {
    it("takes canboat's transmission interval", () => {
      assert.equal(streamOf(battery(1, 12)).interval, 1500)
      assert.equal(
        streamOf(
          new PGN_130312({
            instance: 0,
            source: TemperatureSource.SeaTemperature,
            actualTemperature: 290
          })
        ).interval,
        2000
      )
    })

    it('tells instances apart, not values', () => {
      assert.equal(streamOf(battery(1, 12)).key, streamOf(battery(1, 13)).key)
      assert.notEqual(
        streamOf(battery(1, 12)).key,
        streamOf(battery(2, 12)).key
      )
    })

    it('tells temperature sources apart', () => {
      const temperature = (source: TemperatureSource) =>
        streamOf(new PGN_130312({ instance: 0, source, actualTemperature: 1 }))
      assert.notEqual(
        temperature(TemperatureSource.SeaTemperature).key,
        temperature(TemperatureSource.OutsideTemperature).key
      )
    })

    it('tells tanks of different fluids with the same instance apart', () => {
      const tank = (type: TankType) =>
        streamOf(new PGN_127505({ instance: 0, type, level: 50 }))
      assert.notEqual(tank(TankType.Fuel).key, tank(TankType.Water).key)
    })

    it('tells true and magnetic heading apart', () => {
      const heading = (reference: DirectionReference) =>
        streamOf(new PGN_127250({ heading: 1, reference }))
      assert.notEqual(
        heading(DirectionReference.True).key,
        heading(DirectionReference.Magnetic).key
      )
    })

    it('takes a PGN as a plain object', () => {
      assert.equal(
        streamOf({ pgn: 127508, fields: { instance: 1, voltage: 12 } }).key,
        streamOf(battery(1, 12)).key
      )
    })

    it('does not limit a PGN that is sent irregularly', () => {
      assert.isUndefined(
        streamOf(new PGN_129038({ userId: '244000001' } as any))
      )
    })
  })

  describe('the limiter', () => {
    let clock: sinon.SinonFakeTimers
    let sent: string[]
    let limiter: any
    const send =
      (pgn: any, bus = 'nmea2000out', owner?: unknown) =>
      (label: string) =>
        limiter.send(pgn, bus, () => sent.push(label), owner)

    beforeEach(() => {
      clock = sinon.useFakeTimers({ now: 1000000 })
      sent = []
      limiter = rateLimiter()
    })
    afterEach(() => {
      limiter.stop()
      clock.restore()
    })

    it('sends the first PGN at once', () => {
      send(battery(1, 12))('a')
      assert.deepEqual(sent, ['a'])
    })

    it('sends the latest PGN that came too soon when the interval ends', () => {
      send(battery(1, 12))('a')
      clock.tick(100)
      send(battery(1, 12.1))('b')
      clock.tick(100)
      send(battery(1, 12.2))('c')
      assert.deepEqual(sent, ['a'])
      clock.tick(1299)
      assert.deepEqual(sent, ['a'])
      clock.tick(1)
      assert.deepEqual(sent, ['a', 'c'])
    })

    it('counts the interval from that send', () => {
      send(battery(1, 12))('a')
      clock.tick(100)
      send(battery(1, 12.1))('b')
      clock.tick(1400)
      assert.deepEqual(sent, ['a', 'b'])
      clock.tick(1000)
      send(battery(1, 12.2))('c')
      assert.deepEqual(sent, ['a', 'b'])
      clock.tick(500)
      assert.deepEqual(sent, ['a', 'b', 'c'])
    })

    it('sends at once after a quiet interval', () => {
      send(battery(1, 12))('a')
      clock.tick(1500)
      send(battery(1, 12.1))('b')
      assert.deepEqual(sent, ['a', 'b'])
    })

    it('does not hold back another instance', () => {
      send(battery(1, 12))('a')
      send(battery(2, 13))('b')
      send(battery(3, 14))('c')
      assert.deepEqual(sent, ['a', 'b', 'c'])
    })

    it('does not hold back another bus', () => {
      send(battery(1, 12), 'nmea2000out:can0')('a')
      send(battery(1, 12), 'nmea2000out:can1')('b')
      assert.deepEqual(sent, ['a', 'b'])
    })

    it('holds back the same instance from another conversion', () => {
      send(battery(1, 12), 'nmea2000out', 'one')('a')
      send(battery(1, 13), 'nmea2000out', 'two')('b')
      assert.deepEqual(sent, ['a'])
      clock.tick(1500)
      assert.deepEqual(sent, ['a', 'b'])
    })

    it('does not limit a PGN without an interval', () => {
      const ais = new PGN_129038({ userId: '244000001' } as any)
      send(ais)('a')
      send(ais)('b')
      assert.deepEqual(sent, ['a', 'b'])
    })

    it("drops what waits when its owner cancels, not another owner's", () => {
      send(battery(1, 12), 'nmea2000out', 'one')('a')
      send(battery(2, 13), 'nmea2000out', 'two')('b')
      send(battery(1, 12.1), 'nmea2000out', 'one')('c')
      send(battery(2, 13.1), 'nmea2000out', 'two')('d')
      limiter.cancel('one')
      clock.tick(1500)
      assert.deepEqual(sent, ['a', 'b', 'd'])
      // The cancelled stream sends at once again after its interval
      send(battery(1, 12.2), 'nmea2000out', 'one')('e')
      assert.deepEqual(sent, ['a', 'b', 'd', 'e'])
    })

    it('sends nothing that waits once stopped', () => {
      send(battery(1, 12))('a')
      send(battery(1, 12.1))('b')
      limiter.stop()
      clock.tick(5000)
      assert.deepEqual(sent, ['a'])
    })
  })

  describe('in the plugin', () => {
    // Battery voltages, by instance, in the order they went out
    function voltages(n2kSpy: sinon.SinonSpy) {
      const parser = new FromPgn({ useCamel: false })
      const byInstance: Record<number, number[]> = {}
      n2kSpy.getCalls().forEach((call) => {
        const pgn: any = parser.parseString(call.args[0])
        if (pgn?.pgn === 127508) {
          ;(byInstance[pgn.fields.Instance] ??= []).push(pgn.fields.Voltage)
        }
      })
      return byInstance
    }

    function send(app: any, battery: string, voltage: number) {
      app.handleMessage('testInput', {
        updates: [
          {
            values: [
              {
                path: `electrical.batteries.${battery}.voltage`,
                value: voltage
              }
            ]
          }
        ]
      })
    }

    const wait = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms))

    it('limits each battery on its own, and sends its latest voltage', async function () {
      this.timeout(5000)
      const app = new Server().app
      app.providerStatistics = []
      app.debug = () => {}
      const n2kSpy = sinon.spy()
      app.on('nmea2000out', n2kSpy)
      const plugin = new Sk2n2K(app)
      plugin.start({
        BATTERYv2: {
          enabled: true,
          batteries: [
            { signalkId: 'house', instanceId: 1 },
            { signalkId: 'starter', instanceId: 2 }
          ]
        }
      })
      try {
        send(app, 'house', 12.5)
        await wait(50)
        send(app, 'starter', 12.8)
        send(app, 'house', 12.6)
        await wait(50)
        send(app, 'house', 12.7)
        await wait(100)
        assert.deepEqual(voltages(n2kSpy), { 1: [12.5], 2: [12.8] })
        await wait(1500)
        assert.deepEqual(voltages(n2kSpy), { 1: [12.5, 12.7], 2: [12.8] })
      } finally {
        plugin.stop()
      }
    })
  })
})
