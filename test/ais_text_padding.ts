import chai from 'chai'
const assert: Chai.AssertStatic = chai.assert
import { pgnToActisenseSerialFormat } from '@canboat/canboatjs'
import type { Conversion } from '../types'

// AIS pads unused text characters with '@' (ITU-R M.1371). MFDs such as the
// Raymarine Axiom show 0xff padding in a vessel name as junk characters. The
// conversion tests compare decoded fields, which leave the padding out, so
// this checks the bytes of the 129794 the conversion sends.
describe('AIS 129794 text padding', function () {
  const AT = 0x40

  let skData: Record<string, unknown> = {}
  const app: any = {
    selfId: 'urn:mrn:signalk:uuid:self',
    debug: () => {},
    getPath: (path: string) => skData[path]
  }
  const ais: Conversion = require('../dist/conversions/ais')(app, {})
  // The conversion's own first test: a vessel named SOME BOAT, bound for
  // BALTIMORE, with no callsign
  const test = ais.tests![0]
  skData = test.skData || {}

  function staticDataBytes(): number[] {
    const pgns: any[] = ais.callback!(...test.input!) as any[]
    const pgn = pgns.find((p) => p && p.pgn === 129794)
    assert.exists(pgn, 'the conversion sends 129794')
    return pgnToActisenseSerialFormat(pgn)!
      .split(',')
      .slice(6)
      .map((byte) => parseInt(byte, 16))
  }

  // Where text starts in the data; asserts it is there exactly once
  function indexOfText(data: number[], text: string): number {
    const bytes = [...Buffer.from(text, 'ascii')]
    const starts = data
      .map((_, i) => i)
      .filter((i) => bytes.every((b, j) => data[i + j] === b))
    assert.lengthOf(starts, 1, `${text} appears once`)
    return starts[0]
  }

  it('pads the name to 20 characters with @', function () {
    const data = staticDataBytes()
    const start = indexOfText(data, 'SOME BOAT')
    assert.deepEqual(
      data.slice(start + 'SOME BOAT'.length, start + 20),
      new Array(20 - 'SOME BOAT'.length).fill(AT)
    )
  })

  it('pads an empty callsign with @', function () {
    const data = staticDataBytes()
    // The 7-character callsign is the field just before the name
    const start = indexOfText(data, 'SOME BOAT')
    assert.deepEqual(data.slice(start - 7, start), new Array(7).fill(AT))
  })

  it('pads the destination to 20 characters with @', function () {
    const data = staticDataBytes()
    const start = indexOfText(data, 'BALTIMORE')
    assert.deepEqual(
      data.slice(start + 'BALTIMORE'.length, start + 20),
      new Array(20 - 'BALTIMORE'.length).fill(AT)
    )
  })
})
