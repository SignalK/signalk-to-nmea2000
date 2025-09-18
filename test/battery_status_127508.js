const mocha = require('mocha')
const should = require('chai').should()
const sinon = require('sinon')

const Sk2n2K = require('../')
const Server = require('signalk-server/lib/')

'electrical.batteries.house.voltage', 'electrical.batteries.house.current', 'electrical.batteries.house.temperature'

describe('Battery status 127508', function () {
  it('sequence with some missing data works', function (done) {
    const deltas = [
      {
        interval: 0,
        path: 'electrical.batteries.house.voltage',
        value: 12
      },
      {
        interval: 0,
        path: 'electrical.batteries.house.current',
        value: 2
      },
      {
        interval: 0,
        path: 'electrical.batteries.house.temperature',
        value: 280
      },
      {
        interval: 1100,
        path: 'electrical.batteries.house.current',
        value: 1
      }
    ]

    const app = new Server().app
    app.providerStatistics = []
    app.debug = (x) => {}
    const n2kSpy = sinon.spy()
    app.on('nmea2000JsonOut', n2kSpy)
    setTimeout(() => {
      n2kSpy.callCount.should.equal(2)
      // TODO assert proper fastformat output here
      done()
    }, 1500)
    const sk2n2k = new Sk2n2K(app)
    sk2n2k.start({
      "BATTERYv2": {
        "enabled": true,
        "batteries": [
          {
            "signalkId": "house",
            "instanceId": 1
          }
        ]
      }
    })
    sendDeltas(app, deltas)
  })
})

function sendDeltas (app, deltas) {
  let cumulativeTimeout = 0
  deltas.forEach(deltaSpec => {
    cumulativeTimeout += deltaSpec.interval
    setTimeout(() => {
      app.handleMessage('testInput', {
        updates: [
          {
            values: [
              {
                path: deltaSpec.path,
                value: deltaSpec.value
              }
            ]
          }
        ]
      })
    }, cumulativeTimeout)
  })
}
