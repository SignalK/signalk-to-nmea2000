const chai = require('chai')
chai.should()
const sinon = require('sinon')
const { pgnToActisenseSerialFormat, FromPgn } = require('@canboat/canboatjs')

const parser = new FromPgn({ useCamel: false })

// Encodes and decodes the PGNs, as they would appear on the bus
const decode = pgns => pgns.map(pgn => parser.parseString(pgnToActisenseSerialFormat(pgn)))

const position = () => ({ latitude: 52.37, longitude: 4.89 })

describe('GNSS position data 129029', function () {
  let clock
  let callback

  beforeEach(function () {
    clock = sinon.useFakeTimers({ now: Date.UTC(2026, 9, 12, 12), toFake: ['Date'] })
    callback = require('../conversions/gps.js')({}, {})[0].callback
  })

  afterEach(function () {
    clock.restore()
  })

  it('sends the GNSS values from Signal K', function () {
    const pgns = decode(callback(position(), 12.5, 'GPS', 'DGNSS fix',
      'Safe', 9, 0.9, 1.6, 46.1, 3, 22))
    pgns.map(pgn => pgn.pgn).should.deep.equal([129025, 129029])
    pgns[1].fields.should.deep.include({
      'Altitude': 12.5,
      'GNSS type': 'GPS',
      'Method': 'DGNSS fix',
      'Integrity': 'Safe',
      'Number of SVs': 9,
      'HDOP': 0.9,
      'PDOP': 1.6,
      'Geoidal Separation': 46.1,
      'Reference Stations': 1
    })
    pgns[1].fields.list.should.deep.equal([{
      'Reference Station Type': 'GPS',
      'Reference Station ID': 22,
      'Age of DGNSS Corrections': 3
    }])
  })

  it('accepts canboat names that Signal K passes through', function () {
    const pgns = decode(callback(position(), null, 'GPS+SBAS/WAAS', 'RTK fixed integer'))
    pgns[1].fields.should.include({ 'GNSS type': 'GPS+SBAS/WAAS', 'Method': 'RTK Fixed Integer' })
  })

  it('sends no made-up satellite count or HDOP', function () {
    const fields = decode(callback(position()))[1].fields
    fields.should.not.have.any.keys('Number of SVs', 'HDOP', 'PDOP', 'Altitude', 'GNSS type')
  })

  it('does not report an unknown integrity as Unsafe', function () {
    decode(callback(position()))[1].fields.Integrity.should.equal('No integrity checking')
    clock.tick(1001)
    decode(callback(position(), null, null, null, 'Unsafe'))[1].fields.Integrity.should.equal('Unsafe')
  })

  it('sends 129029 at most once a second, and 129025 only for a new position', function () {
    const pos = position()
    callback(pos, null, null, null, null, 9).map(pgn => pgn.pgn).should.deep.equal([129025, 129029])

    // a GNSS value changes, the position does not
    callback(pos, null, null, null, null, 10).should.deep.equal([])

    callback(position()).map(pgn => pgn.pgn).should.deep.equal([129025])

    clock.tick(1001)
    callback(pos, null, null, null, null, 10).map(pgn => pgn.pgn).should.deep.equal([129025, 129029])
  })

  it('sends nothing without a position', function () {
    callback(null, 12.5, 'GPS').should.deep.equal([])
  })
})
