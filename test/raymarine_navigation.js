const chai = require('chai')
chai.should()
const { FromPgn, pgnToActisenseSerialFormat } = require('@canboat/canboatjs')

const createRaymarineNavigation = require('../conversions/raymarineNavigation')

const parser = new FromPgn({ useCamel: false })

const ROUTE = {
  feature: {
    geometry: {
      coordinates: [
        [-78.635903, 26.517348],
        [-78.637866, 26.516417],
        [-78.637737, 26.515296],
        [-78.636158, 26.514194],
        [-78.634808, 26.511982],
        [-78.62966, 26.49787],
        [-78.62181, 26.486673],
        [-78.7087, 26.476476],
        [-80.023545, 26.771407],
        [-80.037314, 26.772696],
        [-80.049322, 26.768562],
        [-80.047748, 26.747961]
      ]
    }
  }
}

function mockApp ({
  distance = 1915751,
  position = { longitude: -78.6349923366475, latitude: 26.51859369671446 },
  route = ROUTE,
  activeRoute = { href: 'mock', pointIndex: 0, pointTotal: 12 }
} = {}) {
  return {
    courseApi: {
      getCourse: async () => ({
        nextPoint: {
          position: { longitude: -78.635903, latitude: 26.517348 },
          type: 'Location'
        },
        activeRoute
      })
    },
    resourcesApi: {
      getResource: async () => route
    },
    getSelfPath: (key) => {
      if (key === 'navigation.course.calcValues') {
        const calcValues = {
          bearingTrue: { value: 0.1885 },
          bearingMagnetic: { value: 0.3392 }
        }
        if (distance !== undefined)
          calcValues.distance = { value: distance }
        return calcValues
      }
      if (key === 'navigation.position')
        return position === null ? undefined : { value: position }
      return undefined
    }
  }
}

function subConversions (app) {
  const [conversion] = createRaymarineNavigation(app, {})
  return conversion.conversions({})
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

describe('Raymarine navigation 130848/130918', function () {
  it('sends 130848 at once on an actual course change', async function () {
    const app = mockApp({ activeRoute: { href: 'mock', pointIndex: 2, pointTotal: 12 } })
    const subs = subConversions(app)
    const onChange = subs[1].callback

    const messages = await onChange(
      { href: 'mock', pointIndex: 2, pointTotal: 12 },
      { position: { longitude: -78.635903, latitude: 26.517348 }, type: 'Location' },
      null
    )

    const [pgn] = parse(messages)
    pgn.pgn.should.equal(130848)
    pgn.fields['Waypoint Name'].should.equal('Waypoint 3')
    pgn.fields['Waypoint Sequence'].should.equal('0003')
    pgn.fields['Distance to Waypoint'].should.equal(1915751)
  })

  it('sends 130918 at once on an actual course change', async function () {
    const app = mockApp()
    const subs = subConversions(app)
    const onChange = subs[3].callback

    const messages = await onChange(
      { href: 'mock', pointIndex: 0, pointTotal: 12 },
      { position: { longitude: -78.635903, latitude: 26.517348 }, type: 'Location' },
      null
    )

    const [pgn] = parse(messages)
    pgn.pgn.should.equal(130918)
    pgn.fields['Current Waypoint Name'].should.equal('Waypoint 1')
    pgn.fields['Next Waypoint Name'].should.equal('Waypoint 2')
    pgn.fields['Distance, Position to Next Waypoint'].should.equal(374)
  })

  it('does not throw when the route resource is missing', async function () {
    const app = mockApp({ route: null })
    const subs = subConversions(app)
    const timer = subs[2].callback

    const messages = await timer(app)
    chai.expect(messages).to.equal(null)
  })
})
