const Bacon = require("baconjs");
const util = require("util");
const { toPgn, toActisenseSerialFormat } = require("@canboat/canboatjs");
const _ = require('lodash')
const path = require('path')
const fs = require('fs')

module.exports = function(app) {
  var plugin = {
    lastUpdates: {}
  };
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

      'to-n2k' - The outut will be sent through the to-n2k package (https://github.com/tkurki/to-n2k)

      'buffer' - The output should be a buffer that is sent directly to nmea2000out

    sourceType defaults to 'onValueChange'
    outputType defaults to 'to-n2k'
   */

  var sourceTypes = {
    'onDelta': mapOnDelta,
    'onValueChange': mapBaconjs,
    'timer': mapTimer
  }

  var outputTypes = {
    'to-n2k': processToN2K,
    'buffer': processBufferOutput
  }

  plugin.id = "sk-to-nmea2000";
  plugin.name = "Convert Signal K to NMEA2000";
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
          }
        }
      }

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
              var type = _.isUndefined(subConversion.sourceType) ? 'onValueChange' : subConversion.sourceType

              var mapper = sourceTypes[type]
              if ( _.isUndefined(mapper) ) {
                console.error(`Unknown conversion type: ${type}`)
              } else {
                if ( _.isUndefined(subConversion.outputType) ) {
                  subConversion.outputType = 'to-n2k'
                }
                mapper(subConversion, options)
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
      pgn = path.basename(fname, '.js')
      return require(path.join(fpath, pgn))(app, plugin);
    }).filter(converter => { return typeof converter !== 'undefined'; });
  }

  function processBufferOutput(pgns) {
    if ( pgns ) {
      pgns.filter(pgn => pgn != null).forEach(pgn => {
        try {
          const msg = toActisenseSerialFormat(pgn.pgn, pgn.buffer);
          app.debug("emit " + msg);
          app.emit("nmea2000out", msg);
        } catch ( err ) {
          console.error(`error writing pgn ${JSON.stringify(pgn)}`)
          console.error(err.stack)
        }
      })
    }
  }

  function processToN2K(pgns) {
    if ( pgns ) {
      pgns.filter(pgn => pgn != null).forEach(pgn => {

        const key = `${pgn.pgn}.${pgn.Instance}`
        const lastUpdate = plugin.lastUpdates[key]
        const rate = updateRates[pgn.pgn]
        if ( !_.isUndefined(rate) && !_.isUndefined(lastUpdate) && Date.now() - lastUpdate < rate ) {
          return
        } else {
          plugin.lastUpdates[key] = Date.now()
          try {
            app.debug("emit %j", pgn)
            app.emit("nmea2000JsonOut", pgn);
          }
          catch ( err ) {
            console.error(`error writing pgn ${JSON.stringify(pgn)}`)
            console.error(err.stack)
          }
        }
      })
    }
  }

  function processOutput(conversion, output) {
    outputTypes[conversion.outputType](output)
  }

  function mapBaconjs(conversion, options) {
    let lastUpdate

    unsubscribes.push(
      timeoutingArrayStream(
        conversion.keys,
        conversion.timeouts,
        app.streambundle,
        unsubscribes
      )
        .map(values => conversion.callback.call(this, ...values))
        .onValue(pgns => {
          processOutput(conversion, pgns)
        })
    );
  }

  function mapOnDelta(conversion, options) {
    app.signalk.on('delta', (delta) => {
      try {
        processOutput(conversion, conversion.callback(delta))
      } catch ( err ) {
        app.error(err)
        console.error(err.stack)
      }
    })
  }

  function mapTimer(conversion) {
    timers.push(setInterval(() => {
      processOutput(conversion, conversion.callback(app))
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

    var keys = _.isFunction(mapping.keys) ? mapping.keys(options) : keys
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
          processToPGNs(mapping.callback(delta, options))
        } catch ( err ) {
          app.error(err)
        }
      });
  }

  function timeoutingArrayStream (
    keys,
    timeouts = [],
    streambundle,
    unsubscribes
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
      streambundle.getSelfStream(skKey).onValue(value => {
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
      unsubscribes.push(result.onValue(x => app.debug(`${keys}:${JSON.stringify(x)}`)))
    }
    return result
  }
}


const notDefined = x => typeof x === 'undefined'
const isDefined = x => typeof x !== 'undefined'

const updateRates = {
  127506: 1500,
  127508: 1500,
  129026: 250,
  128267: 1000,
  130312: 2000,
  127489: 500,
  129025: 100,
  129029: 1000,
  127250: 100,
  126992: 1000,
  127505: 2500,
  130306: 100
}

