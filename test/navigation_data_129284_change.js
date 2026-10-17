const chai = require('chai')
chai.should()
const sinon = require('sinon')
const { FromPgn, pgnToActisenseSerialFormat } = require('@canboat/canboatjs')

const createNavigationData = require('../conversions/navigationdata')

const parser = new FromPgn({ useCamel: false })

const DESTINATION = { position: { latitude: 32.0631296, longitude: -75.487264 } }
const ROUTE = { pointIndex: 2, pointTotal: 12 }
const NEXT_ROUTE = { pointIndex: 3, pointTotal: 12 }

function mockApp ({ distance = 1000, stale = false, activeRoute = ROUTE } = {}) {
  const timestamp = stale ? Date.now() - 60000 : undefined
  return {
    courseApi: {
      getCourse: async () => ({
        nextPoint: { position: { latitude: 32.0631296, longitude: -75.487264 } },
        activeRoute
      })
    },
    getSelfPath: (key) => {
      if (key === 'navigation.course.calcValues') {
        return {
          distance: { value: distance, timestamp },
          bearingTrue: { value: 0.5, timestamp },
          bearingTrackTrue: { value: 0.6, timestamp },
          velocityMadeGood: { value: 4, timestamp },
          calcMethod: { value: 'Rhumbline', timestamp }
        }
      }
      if (key === 'notifications.navigation.course')
        return {}
      return undefined
    }
  }
}

// A fresh module per call so the rate-limit and last-course state do not leak
// between tests.
function navigationDataSubs (app) {
  const modules = createNavigationData(app, {})
  const navData = modules.find((module) => module.pgn === 129284)
  const [timer, change] = navData.conversions({})
  return { timer, change }
}

function parse (messages) {
  return messages.map((message) => {
    const pgn = parser.parseString(pgnToActisenseSerialFormat(message))
    delete pgn.description
    delete pgn.src
    delete pgn.timestamp
    delete pgn.input
    delete pgn.id
    return pgn
  })
}

describe('Navigation data 129284 course change', function () {
  let clock

  beforeEach(function () {
    clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['Date'] })
  })

  afterEach(function () {
    clock.restore()
  })

  it('sends at once on an actual course change', async function () {
    const app = mockApp()
    const { change } = navigationDataSubs(app)

    const messages = await change.callback(ROUTE, DESTINATION, null)

    const [pgn] = parse(messages)
    pgn.pgn.should.equal(129284)
    pgn.fields['Destination Waypoint Number'].should.equal(3)
    pgn.fields['Distance to Waypoint'].should.equal(1000)
  })

  it('sends nothing when the calculated values are stale', async function () {
    const app = mockApp({ stale: true })
    const { change } = navigationDataSubs(app)

    const messages = await change.callback(ROUTE, DESTINATION, null)
    chai.expect(messages).to.equal(null)
  })

  it('returns null for a repeated identical course tuple', async function () {
    const app = mockApp()
    const { change } = navigationDataSubs(app)

    await change.callback(ROUTE, DESTINATION, null)
    clock.tick(2000)
    const messages = await change.callback(ROUTE, DESTINATION, null)
    chai.expect(messages).to.equal(null)
  })

  it('rate-limits two course changes within the same second', async function () {
    const app = mockApp()
    const { change } = navigationDataSubs(app)

    const first = await change.callback(ROUTE, DESTINATION, null)
    chai.expect(first).to.not.equal(null)
    const second = await change.callback(NEXT_ROUTE, DESTINATION, null)
    chai.expect(second).to.equal(null)
  })

  it('does not let a timer send delay a course change', async function () {
    const app = mockApp()
    const { timer, change } = navigationDataSubs(app)

    const timerMessages = await timer.callback(app)
    chai.expect(timerMessages).to.not.equal(null)
    const changeMessages = await change.callback(ROUTE, DESTINATION, null)
    chai.expect(changeMessages).to.not.equal(null)
  })

  it('waits for the timer after a course change', async function () {
    const app = mockApp()
    const { timer, change } = navigationDataSubs(app)

    const changeMessages = await change.callback(ROUTE, DESTINATION, null)
    chai.expect(changeMessages).to.not.equal(null)
    const timerMessages = await timer.callback(app)
    chai.expect(timerMessages).to.equal(null)
  })
})
