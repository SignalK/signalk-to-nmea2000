const _ = require('lodash')
const should = require('chai').should()
const sinon = require('sinon')
const { FromPgn } = require('@canboat/canboatjs')

const Sk2n2K = require('../')
const Server = require('signalk-server/lib/')

const N2K_SOURCE = { label: 'can0', type: 'NMEA2000', pgn: 129026, src: '35' }
const COG = 'navigation.courseOverGroundTrue'
const SOG = 'navigation.speedOverGround'
const SETTLE_MS = 100

describe('Data from NMEA 2000 sources', function () {
  it('is not sent back', function (done) {
    run({ COG_SOGv2: { enabled: true } }, [
      { path: COG, value: 1, source: N2K_SOURCE },
      { path: SOG, value: 2, source: N2K_SOURCE }
    ], n2kSpy => {
      n2kSpy.callCount.should.equal(0)
    }, done)
  })

  it('withholds a PGN when one of its inputs came from NMEA 2000', function (done) {
    run({ COG_SOGv2: { enabled: true } }, [
      { path: COG, value: 1 },
      { path: SOG, value: 2, source: N2K_SOURCE }
    ], (n2kSpy, sentBefore) => {
      // The COG-only message goes out before SOG arrives; nothing after it
      sentBefore.should.equal(1)
      n2kSpy.callCount.should.equal(sentBefore)
    }, done)
  })

  it('is sent when the conversion allows NMEA 2000 sources', function (done) {
    run({ COG_SOGv2: { enabled: true, allowNmea2000Sources: true } }, [
      { path: COG, value: 1, source: N2K_SOURCE },
      { path: SOG, value: 2, source: N2K_SOURCE }
    ], n2kSpy => {
      n2kSpy.callCount.should.be.above(0)
      lastFields(n2kSpy).should.include({ COG: 1, SOG: 2 })
    }, done)
  })

  it('is sent when the user picked that source explicitly', function (done) {
    run({
      COG_SOGv2: {
        enabled: true,
        navigationcourseOverGroundTrue: 'can0.35',
        navigationspeedOverGround: 'can0.35'
      }
    }, [
      { path: COG, value: 1, source: N2K_SOURCE },
      { path: SOG, value: 2, source: N2K_SOURCE }
    ], n2kSpy => {
      n2kSpy.callCount.should.be.above(0)
      lastFields(n2kSpy).should.include({ COG: 1, SOG: 2 })
    }, done)
  })

  it('does not hold back data from other sources', function (done) {
    run({ COG_SOGv2: { enabled: true } }, [
      { path: COG, value: 1 },
      { path: SOG, value: 2 }
    ], n2kSpy => {
      n2kSpy.callCount.should.be.above(0)
      lastFields(n2kSpy).should.include({ COG: 1, SOG: 2 })
    }, done)
  })

  it('stops resending a PGN once an NMEA 2000 input withholds it', function (done) {
    run({ COG_SOGv2: { enabled: true, resend: 1, resendTime: 30 } }, [
      { path: COG, value: 1 },
      { path: SOG, value: 2, source: N2K_SOURCE }
    ], (n2kSpy, sentBefore) => {
      sentBefore.should.equal(1)
      n2kSpy.callCount.should.equal(sentBefore)
    }, done, 1500)
  })

  describe('AIS', function () {
    const aisDelta = source => ({
      context: 'vessels.urn:mrn:imo:mmsi:230123456',
      updates: [{
        ...(source ? { source } : {}),
        values: [
          { path: '', value: { mmsi: '230123456' } },
          { path: 'navigation.position', value: { latitude: 60.1, longitude: 24.9 } }
        ]
      }]
    })

    it('does not resend targets received over NMEA 2000', function (done) {
      runRaw({ AISv2: { enabled: true } }, aisDelta({ ...N2K_SOURCE, pgn: 129038 }), n2kSpy => {
        n2kSpy.callCount.should.equal(0)
      }, done)
    })

    it('sends targets from other sources', function (done) {
      runRaw({ AISv2: { enabled: true } }, aisDelta(), n2kSpy => {
        n2kSpy.callCount.should.be.above(0)
      }, done)
    })
  })

  describe('notifications', function () {
    const alarm = (path, source, message = 'Low oil pressure') => ({
      context: 'vessels.self',
      updates: [{
        ...(source ? { source } : {}),
        values: [{
          path,
          value: { state: 'alarm', method: ['visual', 'sound'], message }
        }]
      }]
    })
    const alertTexts = n2kSpy =>
      n2kSpy.getCalls()
        .map(call => new FromPgn({ useCamel: false }).parseString(call.args[0]))
        .filter(pgn => pgn && pgn.pgn === 126985)
        .map(pgn => pgn.fields['Alert Text Description'])

    it('sends alerts made from NMEA 2000 data', function (done) {
      runRaw({ NOTIFICATIONS: { enabled: true } },
        alarm('notifications.propulsion.port.lowOilPressure', { ...N2K_SOURCE, pgn: 127489 }),
        n2kSpy => {
          alertTexts(n2kSpy).should.include('Low oil pressure')
        }, done)
    })

    it('sends nothing for a received alert, not even earlier ones', function (done) {
      const value = { state: 'alarm', method: ['visual', 'sound'], message: 'Low oil pressure' }
      run({ NOTIFICATIONS: { enabled: true } }, [
        { path: 'notifications.propulsion.port.lowOilPressure', value },
        {
          path: 'notifications.nmea.bilge',
          value: { ...value, message: 'High bilge' },
          source: { ...N2K_SOURCE, pgn: 126983 }
        }
      ], (n2kSpy, sentBefore) => {
        sentBefore.should.be.above(0)
        n2kSpy.callCount.should.equal(sentBefore)
      }, done)
    })

    it('does not resend alerts received over NMEA 2000', function (done) {
      runRaw({ NOTIFICATIONS: { enabled: true } },
        alarm('notifications.nmea.bilge', { ...N2K_SOURCE, pgn: 126983 }, 'High bilge'),
        n2kSpy => {
          alertTexts(n2kSpy).should.not.include('High bilge')
        }, done)
    })
  })
})

function runRaw (options, delta, check, done) {
  const app = new Server().app
  app.providerStatistics = []
  app.debug = () => {}
  app.error = err => done(err)
  // Provided by the plugin API in a running server, not by the bare test app
  app.getPath = path => _.get(app.signalk.retrieve(), path)
  const n2kSpy = sinon.spy()
  app.on('nmea2000out', n2kSpy)
  new Sk2n2K(app).start(options)
  app.handleMessage(delta.updates[0].source ? 'can0' : 'testInput', delta)
  setTimeout(() => {
    try {
      check(n2kSpy)
      done()
    } catch (err) {
      done(err)
    }
  }, SETTLE_MS)
}

// Sends the first delta, records how many PGNs went out, then sends the rest
// and lets check() inspect the spy after `wait` ms.
function run (options, deltas, check, done, wait = SETTLE_MS) {
  const app = new Server().app
  app.providerStatistics = []
  app.debug = () => {}
  app.debug.enabled = true
  const n2kSpy = sinon.spy()
  app.on('nmea2000out', n2kSpy)
  new Sk2n2K(app).start(options)

  const [first, ...rest] = deltas
  send(app, first)
  setTimeout(() => {
    const sentBefore = n2kSpy.callCount
    rest.forEach(delta => send(app, delta))
    setTimeout(() => {
      try {
        check(n2kSpy, sentBefore)
        done()
      } catch (err) {
        done(err)
      }
    }, wait)
  }, SETTLE_MS)
}

function send (app, { path, value, source }) {
  const update = { values: [{ path, value }] }
  if (source) {
    update.source = source
  }
  app.handleMessage(source ? source.label : 'testInput', { updates: [update] })
}

function lastFields (n2kSpy) {
  return new FromPgn({ useCamel: false }).parseString(n2kSpy.lastCall.args[0])
    .fields
}
