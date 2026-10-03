const Bacon = require("baconjs");
const util = require("util");
const _ = require('lodash')
const path = require('path')
const fs = require('fs')
const { pgnToActisenseSerialFormat } = require('@canboat/canboatjs')

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

    Data whose source is NMEA 2000 is not sent unless the conversion's
    allowNmea2000Sources option is set: the output goes to every NMEA 2000
    connection, so it would be echoed back onto the bus it came from.
    A conversion that sets preventsNmea2000Echo keeps its own loops out
    (notifications skips notifications.nmea.*) and gets all its data.
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
          },
        }
      }
      if ( !conversion.preventsNmea2000Echo ) {
        obj.properties.allowNmea2000Sources = {
          type: 'boolean',
          title: 'Also send data that came from NMEA 2000',
          description: 'Leave off unless bridging separate NMEA 2000 networks: the output goes to every NMEA 2000 connection, including the one the data came from',
          default: false
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
      let pgn = path.basename(fname, '.js')
      return require(path.join(fpath, pgn))(app, plugin);
    }).filter(converter => { return typeof converter !== 'undefined'; });
  }

  // The conversions give values in SI, as Signal K has them. Encode them
  // here with this plugin's own canboatjs (4 or later, which takes SI) and
  // send the frame as an Actisense line, which every NMEA 2000 connection
  // handles as it does a PGN object. The server's canboatjs, of whatever
  // version, then only passes the frame on and never sees the values.
  // A PGN that cannot be encoded here is dropped, not handed to the server
  // as JSON: a server on canboatjs 3 would read its SI values in the old
  // units and put wrong values on the bus.
  function emitPgn(pgn) {
    let line
    try {
      line = pgnToActisenseSerialFormat(pgn)
    } catch (err) {
      app.error(`cannot encode PGN ${pgn.pgn}: ${err.message}`)
      return
    }
    if (!line) {
      app.error(`cannot encode PGN ${pgn.pgn}`)
      return
    }
    app.debug(`emit nmea2000out ${line}`)
    app.emit('nmea2000out', line)
  }

  function processToN2K(values) {
    if (values) {
      Promise.all(values).then(pgns => {
        pgns.filter(pgn => pgn != null).forEach(pgn => {
          try {
            emitPgn(pgn)
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
        options,
        sendsNmea2000Data(conversion, options)
      )
        .onValue(values => {
          if ( values === WITHHELD ) {
            // The last PGN no longer reflects the inputs; stop resending it
            if ( conversion.resendTimer ) {
              clearResendInterval(conversion.resendTimer)
              conversion.resendTimer = undefined
            }
            return
          }
          processOutput(conversion, options, conversion.callback.call(this, ...values))
        })
    );
  }

  function mapOnDelta(conversion, options) {
    app.signalk.on('delta', (delta) => {
      if ( !sendsNmea2000Data(conversion, options) ) {
        delta = withoutNmea2000Updates(delta)
        if ( !delta ) {
          return
        }
      }
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
      let values = conversion.keys?.map(key => {
        let update = app.getSelfPath(key)
        if (update && 'value' in update)
          return update.value
        else
          return update
      }) || []
      processOutput(conversion, null, conversion.callback(app, ...values))
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
        if ( !sendsNmea2000Data(mapping, options) ) {
          delta = withoutNmea2000Updates(delta)
          if ( !delta ) {
            return
          }
        }
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
    options,
    allowNmea2000
  ) {
    app.debug(`keys:${keys}`)
    app.debug(`timeouts:${timeouts}`)
    const lastValues = keys.reduce((acc, key) => {
      acc[key] = {
        timestamp: new Date().getTime(),
        value: null,
        fromNmea2000: false
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
      bus.onValue(({ value, source }) => {
        lastValues[skKey] = {
          timestamp: new Date().getTime(),
          value,
          // A source the user picked explicitly is sent even if it is NMEA 2000
          fromNmea2000: !sourceRef && !allowNmea2000 && isNmea2000Source(source)
        }
        const now = new Date().getTime()

        const current = keys.map((key, i) =>
          notDefined(timeouts[i]) || lastValues[key].timestamp + timeouts[i] > now
            ? lastValues[key]
            : null
        )
        // One NMEA 2000 input withholds the whole PGN: sending the others with
        // that field unavailable would compete with the device already on the bus
        if ( current.some(entry => entry && entry.value != null && entry.fromNmea2000) ) {
          combinedBus.push(WITHHELD)
          return
        }
        combinedBus.push(current.map(entry => entry ? entry.value : null))
      })
    })
    const result = combinedBus.debounce(10)
    if (app.debug.enabled) {
      unsubscribes.push(result.onValue(x => app.debug(`${keys}:${String(x)}`)))
    }
    return result
  }

};

function pathToPropName(path) {
  return path.replace(/\./g, '')

}

const isNmea2000Source = source => source?.type === 'NMEA2000'

const sendsNmea2000Data = (conversion, options) =>
  Boolean(options.allowNmea2000Sources || conversion.preventsNmea2000Echo)

// Pushed instead of values when an NMEA 2000 input withholds the PGN
const WITHHELD = Symbol('withheld')

// The delta with its NMEA 2000 updates removed, or undefined if none remain
function withoutNmea2000Updates(delta) {
  if ( !delta.updates ) {
    return delta
  }
  const updates = delta.updates.filter(update => !isNmea2000Source(update.source))
  if ( updates.length === 0 ) {
    return undefined
  }
  return updates.length === delta.updates.length ? delta : { ...delta, updates }
}


const notDefined = x => typeof x === 'undefined'
const isDefined = x => typeof x !== 'undefined'
