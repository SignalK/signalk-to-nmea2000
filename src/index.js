const Bacon = require("baconjs");
const util = require("util");
const _ = require('lodash')
const path = require('path')
const fs = require('fs')
const { convertCamelCase } = require('@canboat/ts-pgns')

module.exports = function(app) {
  var plugin = {};
  var unsubscribes = [];
  var timers = []
  var conversions = load_conversions(app, plugin)
  conversions = [].concat.apply([], conversions)

  /*
    Each conversion can specify the sourceType and outputType.

    Source type can be:

      onDelta - You will get all deltas via app.signalk.on('delta', ...). Please do no use this unless absolutely necessary.

      onValueChange - The conversion should specify a variable called 'keys' which is an array of the Signal K paths that the convesion needs

      timer - The conversions callback will get called per the givien 'interval' variable

    Output type can be:

      'to-n2k' - The output will be sent through the to-n2k package (https://github.com/tkurki/to-n2k)

    sourceType defaults to 'onValueChange'
    outputType defaults to 'to-n2k'
   */

  var sourceTypes = {
    'onDelta': mapOnDelta,
    'onValueChange': mapBaconjs,
    'subscription': mapSubscription,
    'timer': mapTimer
  }

  var outputTypes = {
    'to-n2k': processToN2K
  }

  plugin.id = "sk-to-nmea2000";
  plugin.name = "Signal K to NMEA 2000";
  plugin.description = "Plugin to convert Signal K to NMEA2000";

  var schema = {
    type: "object",
    title: "Conversions to NMEA2000",
    description:
    "If there is SignalK data for the conversion generate the following NMEA2000 pgns from Signal K data:",
    properties: {}
  };

  updateSchema()

  function updateSchema() {
    conversions.forEach(conversion => {
      var obj =  {
        type: 'object',
        title: conversion.title,
        properties: {
          enabled: {
            title: 'Enabled',
            type: 'boolean',
            default: false
          },
          resend: {
            type: 'number',
            title: 'Resend (seconds)',
            description:'If non-zero, the msg will be periodically resent',
            default: 0
          },
          resendTime: {
            type: 'number',
            title: 'Resend Duration (seconds)',
            description:'The value will be resent for the given #number of seconds',
            default: 30
          }
        }
      }
      const safeKeys = conversion.keys || []
      safeKeys.forEach((key, i) => {
        obj.properties[pathToPropName(key)] = {
          title: `Source for ${key}`,
          description: `Use data only from this source (leave blank to ignore source)`,
          type : 'string'
        }
      })

      schema.properties[conversion.optionKey] = obj

      if ( conversion.properties ) {
        var props = typeof conversion.properties === 'function' ? conversion.properties() : conversion.properties
        _.extend(obj.properties, props)
      }
    })
  }

  plugin.schema = function() {
    updateSchema()
    return schema
  }

  plugin.start = function(options) {
    conversions.forEach(conversion => {
      if ( !_.isArray(conversion) ) {
        conversion = [ conversion ]
      }
      conversion.forEach(conversion => {
        if ( options[conversion.optionKey] && options[conversion.optionKey].enabled ) {
          app.debug(`${conversion.title} is enabled`)

          var subConversions = conversion.conversions
          if ( _.isUndefined(subConversions) ) {
            subConversions = [ conversion ]
          } else if ( _.isFunction(subConversions) ) {
            subConversions = subConversions(options)
          }
          if ( subConversions != null ) {
            subConversions.forEach(subConversion => {
              if ( !_.isUndefined(subConversion) ) {
                var type = _.isUndefined(subConversion.sourceType) ? 'onValueChange' : subConversion.sourceType
                var mapper = sourceTypes[type]
                if ( _.isUndefined(mapper) ) {
                  console.error(`Unknown conversion type: ${type}`)
                } else {
                  if ( _.isUndefined(subConversion.outputType) ) {
                    subConversion.outputType = 'to-n2k'
                  }
                  mapper(subConversion, options[conversion.optionKey])
                }
              }
            })
          }
        }
      })
    })
  };

  plugin.stop = function() {
    unsubscribes.forEach(f => f());
    unsubscribes = [];
    timers.forEach(timer => clearInterval(timer))
    timers = []
  };

  return plugin;

  function load_conversions (app, plugin) {
    fpath = path.join(__dirname, 'conversions')
    files = fs.readdirSync(fpath)
    return files.map(fname => {
      if ( fname.endsWith('.js') ) {
        let pgn = path.basename(fname, '.js')
        return require(path.join(fpath, pgn))(app, plugin);
      }
    }).filter(converter => { return typeof converter !== 'undefined'; });
  }

  function processToN2K(values) {
    if (values) {
      Promise.all(values).then(pgns => {
        pgns.filter(pgn => pgn != null).forEach(pgn => {
          const converted = convertCamelCase(app, pgn)
          
          try {
            app.debug(`emit nmea2000JsonOut ${JSON.stringify(converted)}`)
            app.emit("nmea2000JsonOut", converted);
          }
          catch ( err ) {
            console.error(`error writing pgn ${JSON.stringify(pgn)}`)
            console.error(err.stack)
          }
        })
        if ( app.reportOutputMessages ) {
          app.reportOutputMessages(pgns.length)
        }
      });
    }
  }

  function clearResendInterval(timer) {
    let idx = timers.indexOf(timer)
    if ( idx != -1 ) {
      timers.splice(idx, 1)
    }
    clearInterval(timer)
  }

  function processOutput(conversion, options, output) {
    if ( options && options.resend && options.resend > 0 ) {
      if ( conversion.resendTimer ) {
        clearResendInterval(conversion.resendTimer)
      }
      const startedAt = Date.now()
      conversion.resendTimer = setInterval(() => {
        Promise.resolve(output).then((values) => {
          outputTypes[conversion.outputType](values)
        })
        if ( Date.now() - startedAt > (options.resendTime || 30) * 1000 ) {
          clearResendInterval(conversion.resendTimer)
        }
      }, options.resend * 1000)
      timers.push(conversion.resendTimer)
    }
    Promise.resolve(output).then((values) => {
      outputTypes[conversion.outputType](values)
    })
  }

  function mapBaconjs(conversion, options) {
    unsubscribes.push(
      timeoutingArrayStream(
        conversion.keys,
        conversion.timeouts,
        app.streambundle,
        unsubscribes,
        options
      )
        .map(values => conversion.callback.call(this, ...values))
        .onValue(pgns => {
          processOutput(conversion, options, pgns)
        })
    );
  }

  function mapOnDelta(conversion, options) {
    app.signalk.on('delta', (delta) => {
      try {
        processOutput(conversion, options, conversion.callback(delta))
      } catch ( err ) {
        app.error(err)
        console.error(err.stack)
      }
    })
  }

  function mapTimer(conversion, options) {
    timers.push(setInterval(() => {
      processOutput(conversion, null, conversion.callback(app))
    }, conversion.interval));
  }

  function subscription_error(err)
  {
    app.error(err.toString())
  }

  function mapSubscription(mapping, options) {
    var subscription = {
      "context": mapping.context,
      subscribe: []
    }

    var keys = _.isFunction(mapping.keys) ? mapping.keys(options) : mapping.keys
    keys.forEach(key => {
      subscription.subscribe.push({ path: key})
    });

    app.debug("subscription: " + JSON.stringify(subscription))

    app.subscriptionmanager.subscribe(
      subscription,
      unsubscribes,
      subscription_error,
      delta => {
        try {
          processOutput(mapping, options, mapping.callback(delta))
        } catch ( err ) {
          app.error(err)
        }
      });
  }

  function timeoutingArrayStream (
    keys,
    timeouts = [],
    streambundle,
    unsubscribes,
    options
  ) {
    app.debug(`keys:${keys}`)
    app.debug(`timeouts:${timeouts}`)
    const lastValues = keys.reduce((acc, key) => {
      acc[key] = {
        timestamp: new Date().getTime(),
        value: null
      }
      return acc
    }, {})
    const combinedBus = new Bacon.Bus()
    keys.map(skKey => {
      const sourceRef = options[pathToPropName(skKey)]
      app.debug(`${skKey} ${sourceRef}`)

      let bus = streambundle.getSelfBus(skKey)
      if (sourceRef) {
        bus = bus.filter( x => x.$source === sourceRef)
      }
      bus.map('.value').onValue(value => {
        lastValues[skKey] = {
          timestamp: new Date().getTime(),
          value
        }
        const now = new Date().getTime()

        combinedBus.push(
          keys.map((key, i) => {
            return notDefined(timeouts[i]) ||
              lastValues[key].timestamp + timeouts[i] > now
              ? lastValues[key].value
              : null
          })
        )
      })
    })
    const result = combinedBus.debounce(10)
    if (app.debug.enabled) {
      unsubscribes.push(result.onValue(x => app.debug(`${keys}:${x}`)))
    }
    return result
  }

};

function pathToPropName(path) {
  return path.replace(/\./g, '')

}


const notDefined = x => typeof x === 'undefined'
const isDefined = x => typeof x !== 'undefined'
