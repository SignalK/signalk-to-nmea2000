import chai from 'chai'
chai.should()
import sinon from 'sinon'
import _ from 'lodash'
import { FromPgn } from '@canboat/canboatjs'

const Sk2n2K = require('../dist')
const Server = require('signalk-server/lib/')

describe('Navigation data 129284', function () {
  let clock: sinon.SinonFakeTimers

  beforeEach(function () {
    clock = sinon.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']
    })
  })

  afterEach(function () {
    clock.restore()
  })

  it('keeps the destination position while the course values update', async function () {
    const app = new Server().app
    app.providerStatistics = []
    app.debug = () => {}
    // A bare server app lacks the plugin app's data access. The conversion
    // reads the calculated values from the Signal K tree and the destination
    // from the Course API, so provide both as the plugin app would.
    app.getSelfPath = (aPath: string) => _.get(app.signalk.self, aPath)
    app.courseApi = {
      getCourse: async () => ({
        nextPoint: app.getSelfPath('navigation.course.nextPoint')?.value,
        activeRoute: app.getSelfPath('navigation.course.activeRoute')?.value
      })
    }
    // Decoded with display names, which the ts-pgns types don't have
    const sent: any[] = []
    const parser = new FromPgn({ useCamel: false })
    app.on('nmea2000out', (line: string) => sent.push(parser.parseString(line)))

    const sk2n2k = new Sk2n2K(app)
    sk2n2k.start({ navigationdata: { enabled: true } })

    // The Course API sends nextPoint when the destination is set, not again.
    send(app, {
      'navigation.course.nextPoint': {
        type: 'Location',
        position: { latitude: 32.0631296, longitude: -75.487264 }
      }
    })
    const courseValues = (distance: number) => ({
      'navigation.course.calcValues.distance': distance,
      'navigation.course.calcValues.bearingTrue': 1.23,
      'navigation.course.calcValues.bearingTrackTrue': 3.1,
      'navigation.course.calcValues.velocityMadeGood': 4
    })
    send(app, courseValues(1000))
    clock.tick(20)
    await flush()

    clock.tick(15000)
    send(app, courseValues(940))
    clock.tick(20)
    await flush()

    const last = sent.filter((p) => p.pgn === 129284).pop().fields
    last['Distance to Waypoint'].should.equal(940)
    last['Destination Latitude'].should.equal(32.0631296)
    last['Destination Longitude'].should.equal(-75.487264)
    sk2n2k.stop()
  })
})

// Output is emitted from promise callbacks
const flush = () => new Promise((resolve) => setImmediate(resolve))

function send (app: any, values: Record<string, unknown>) {
  app.handleMessage('testInput', {
    updates: [
      {
        values: Object.entries(values).map(([path, value]) => ({ path, value }))
      }
    ]
  })
}
