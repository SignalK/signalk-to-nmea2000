const Concentrate2 = require("concentrate2");
const _ = require('lodash')

module.exports = (app, plugin, options) => {

  function getBatteries() {
    if ( _.get(app.signalk.self, "electrical.batteries") )
    {
      return _.keys(app.signalk.self.electrical.batteries)
    } else {
      return undefined
    }
  }

  const batteryKeys = [
    'voltage',
    'current',
    'temperature',
    'capacity.stateOfCharge',
    'capacity.timeRemaining',
    'capacity.stateOfHealth',
    'ripple'
  ]
  
  return {
    title: 'Battery (127506 & 127508)',
    type: 'toSubscription',
    optionKey: 'BATTERY',
    context: 'vessels.self',
    keys: (options) => {
      var res = []
      _.keys(options.BATTERY).forEach(prop => {
        if ( prop.startsWith('instance') && options.BATTERY[prop] ) {
          var instance = prop.substring(8)
          res = res.concat(batteryKeys.map(key => {
            return `electrical.batteries.${instance}.${key}`
          }))
        }
      })
      return res
    },
    properties: () => {
      var props = {}
      var batteries = getBatteries()
      if ( batteries ) {
        batteries.forEach(instance => {
          props[`instance${instance}`] = {
            title: `Instance ${instance}`,
            type: 'boolean',
            default:false
          }
        })
      }
      return props
    },
    callback: (delta, options) => {
      var flat = flattenDelta(delta)
      var res = []
      _.keys(options.BATTERY).forEach(prop => {
        if ( prop.startsWith('instance') && options.BATTERY[prop] ) {
          var instance = prop.substring(8)

          function get(key) {
            return flat[`electrical.batteries.${instance}.${key}`]
          }
          
          var voltage = get('voltage'),
              current = get('current'),
              temperature = get('temperature'),
              stateOfCharge = get('capacity.stateOfCharge'),
              timeRemaining = get('capacity.timeRemaining'),
              stateOfHealth = get('capacity.stateOfHealth'),
              ripple = get('ripple')

          if ( !_.isUndefined(voltage)
               || !_.isUndefined(current)
               || !_.isUndefined(temperature) ) {
            voltage = _.isUndefined(voltage) ? 0x7fff : voltage * 100
            temperature = _.isUndefined(temperature) ? 0xffff : temperature * 100
            current = _.isUndefined(current) ? 0x7fff : current * 10
            res.push({
              pgn: 127508,
              buffer: Concentrate2()
                .uint8(instance)
                .uint16(voltage)
                .uint16(current)
                .uint16(temperature)
                .uint8(0xff)
                .result()
            })
          }

          if ( !_.isUndefined(stateOfCharge)
               || !_.isUndefined(timeRemaining)
               || !_.isUndefined(stateOfHealth)
               || !_.isUndefined(ripple) ) {
            stateOfCharge = _.isUndefined(stateOfCharge) ? 0xff : stateOfCharge*100
            timeRemaining = _.isUndefined(timeRemaining) ? 0xffff : timeRemaining
            stateOfHealth = _.isUndefined(stateOfHealth) ? 0xff : stateOfHealth*100
            ripple = _.isUndefined(ripple) ? 0xffff : ripple * 100
            res.push({
              pgn: 127506,
              buffer: Concentrate2()
                .uint8(0xff)
                .uint8(instance)
                .uint8(0x00)
                .uint8(stateOfCharge)
                .uint8(stateOfHealth)
                .uint16(timeRemaining)
                .uint16(ripple)
                .result()
            })
          }
        }
      })
      return res
    }
  }
}

function flattenDelta(delta) {
  var res = {}
  delta.updates.forEach(update => {
    update.values.forEach(pathValue => {
      res[pathValue.path] = pathValue.value
    })
  })
  return res
}

