import chai from 'chai'
const assert: Chai.AssertStatic = chai.assert
import { pgnToActisenseSerialFormat } from '@canboat/canboatjs'
import type { Conversion } from '../types'

// The conversion tests compare decoded fields, which leave out the reserved
// ones. These check the reserved bits of a 129285 route packet in its bytes.
describe('Route/WP Information 129285', function () {
  const app: any = {
    debug: () => {},
    error: () => {},
    getSelfPath: () => undefined,
    courseApi: {
      getCourse: async () => ({
        nextPoint: { position: { latitude: -35.1, longitude: 138.1 } },
        activeRoute: { href: '/resources/routes/r1', name: 'R' }
      })
    },
    resourcesApi: {
      getResource: async () => ({
        feature: {
          geometry: {
            coordinates: [
              [138.1, -35.1],
              [138.2, -35.2]
            ]
          }
        }
      })
    }
  }

  async function routePacketBytes(): Promise<number[]> {
    const conversions: Conversion[] =
      require('../dist/conversions/navigationdata')(app, {})
    const routeWP = conversions.find(
      (c) => c.optionKey === 'routewpinformation'
    )!
    const [conversion] = (
      routeWP.conversions as (options: unknown) => Conversion[]
    )({})
    const pgns: any = await conversion.callback!(app)
    assert.equal(pgns.length, 1)
    // timestamp,prio,pgn,src,dst,len,data bytes...
    return pgnToActisenseSerialFormat(pgns[0])!
      .split(',')
      .slice(6)
      .map((byte) => parseInt(byte, 16))
  }

  it('sets the reserved bits of a route packet to ones', async function () {
    const data = await routePacketBytes()
    // Start RPS#, nItems, Database ID and Route ID: 2 bytes each
    const flags = data[8]
    assert.equal(flags & 0x07, 0, 'Navigation direction in route: Forward')
    assert.equal(
      (flags >> 3) & 0x03,
      0,
      'Supplementary Route/WP data available: Off'
    )
    assert.equal(flags >> 5, 0x07, 'the 3 reserved bits')

    // Route Name "R": length 3, encoding 1 (ASCII), one character
    assert.deepEqual(data.slice(9, 12), [3, 1, 'R'.charCodeAt(0)])
    assert.equal(data[12], 0xff, 'the reserved byte after the route name')
  })
})
