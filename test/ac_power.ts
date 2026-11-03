import chai from 'chai'
chai.should()
import sinon from 'sinon'
import { FromPgn } from '@canboat/canboatjs'

const Sk2n2K = require('../dist')
const Server = require('signalk-server/dist/')

const SETTLE_MS = 100

function start (options: Record<string, unknown>) {
  const app = new Server().app
  app.providerStatistics = []
  app.debug = () => {}
  const n2kSpy = sinon.spy()
  app.on('nmea2000out', n2kSpy)
  new Sk2n2K(app).start(options)
  return { app, n2kSpy }
}

const send = (app: any, values: { path: string; value: unknown }[]) =>
  app.handleMessage('testInput', { updates: [{ values }] })

// Decoded with display names, which the ts-pgns types don't have
const decoded = (n2kSpy: sinon.SinonSpy): any[] =>
  n2kSpy.getCalls().map(call => new FromPgn({ useCamel: false }).parseString(call.args[0]))

describe('AC power', function () {
  it('sends a three phase bus from the Signal K tree as 127503', function (done) {
    const { app, n2kSpy } = start({
      AC_INPUT: { enabled: true, buses: [{ signalkId: 'shore', instanceId: 3 }] }
    })
    send(app, ['A', 'B', 'C'].flatMap((phase, i) => [
      { path: `electrical.ac.shore.phase.${phase}.lineNeutralVoltage`, value: 230 + i },
      { path: `electrical.ac.shore.phase.${phase}.current`, value: 10 + i }
    ]))
    setTimeout(() => {
      try {
        const last = decoded(n2kSpy).filter(pgn => pgn.pgn === 127503).pop()
        last.fields.Instance.should.equal(3)
        last.fields.list.map((line: any) => [line.Line, line.Voltage, line.Current]).should.deep.equal([
          ['Line 1', 230, 10], ['Line 2', 231, 11], ['Line 3', 232, 12]
        ])
        decoded(n2kSpy).some(pgn => pgn.pgn === 127744).should.equal(false)
        done()
      } catch (err) {
        done(err)
      }
    }, SETTLE_MS)
  })

  it('sends the AC output of an inverter as 127504', function (done) {
    const { app, n2kSpy } = start({
      AC_OUTPUT: { enabled: true, inverters: [{ signalkId: 'main', instanceId: 1 }] }
    })
    send(app, [
      { path: 'electrical.inverters.main.ac.lineNeutralVoltage', value: 229.8 },
      { path: 'electrical.inverters.main.ac.realPower', value: 950 }
    ])
    setTimeout(() => {
      try {
        const last = decoded(n2kSpy).filter(pgn => pgn.pgn === 127504).pop()
        last.fields.list.should.deep.equal([{ Line: 'Line 1', Voltage: 229.8, 'Real Power': 950 }])
        done()
      } catch (err) {
        done(err)
      }
    }, SETTLE_MS)
  })
})
