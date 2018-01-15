const Bacon = require("baconjs");
const debug = require("debug")("signalk:signalk-to-nmea2000");
const util = require("util");
const toPgn = require("to-n2k").toPgn;
const _ = require('lodash')
const path = require('path')
const fs = require('fs')

module.exports = function(app) {
  var plugin = {};
  var unsubscribes = [];
  var timers = []
  var conversions = load_conversions(app, plugin)

  var types = {
    'onDelta': mapOnDelta,
    'toPgn': mapToPgn,
    'toN2K': mapToNmea,
    'timer': mapTimer
  }

  plugin.id = "sk-to-nmea2000";
  plugin.name = "Convert Signal K to NMEA2000";
  plugin.description = "Plugin to convert Signal K to NMEA2000";

  plugin.schema = {
    type: "object",
    title: "Conversions to NMEA2000",
    description:
    "If there is SignalK data for the conversion generate the following NMEA2000 pgns from Signal K data:",
    properties: {}
  };

  conversions.forEach(conversion => {
    plugin.schema.properties[conversion.optionKey] =  {
      title: conversion.title,
      type: 'boolean',
      default: false
    }
  })
  
  plugin.start = function(options) {
    debug("start");

    conversions.forEach(conversion => {
      if ( options[conversion.optionKey] ) {
        debug(`${conversion.title} is enabled`)
        var mapper = types[conversion.type]
        if ( _.isUndefined(mapper) ) {
          console.error(`Unknown conversion type: ${conversion.type}`)
        } else {
          mapper(conversion)
        }
      }
    })
  };

  plugin.stop = function() {
    unsubscribes.forEach(f => f());
    unsubscribes = [];
    timers.forEach(timer => clearInterval(timer))
    timers = []
  };

  return plugin;

  function toActisenseSerialFormat(pgn, data, dst) {
    dst = _.isUndefined(dst) ? '255' : dst
    return (
      new Date().toISOString() +
        ",2," +
        pgn +
        `,0,${dst},` +
        data.length +
        "," +
        new Uint32Array(data)
        .reduce(function(acc, i) {
          acc.push(i.toString(16));
          return acc;
        }, [])
        .map(x => (x.length === 1 ? "0" + x : x))
        .join(",")
    );
  }

  function load_conversions (app, plugin) {
    fpath = path.join(__dirname, 'conversions')
    files = fs.readdirSync(fpath)
    return files.map(fname => {
      pgn = path.basename(fname, '.js')
      return require(path.join(fpath, pgn))(app, plugin);
    }).filter(converter => { return typeof converter !== 'undefined'; });
  }

  function processPGNs(pgns) {
    if ( pgns ) {
      pgns.filter(pgn => pgn != null).forEach(pgn => {
        const msg = toActisenseSerialFormat(pgn.pgn, pgn.buffer);
        debug("emit " + msg);
        app.emit("nmea2000out", msg);
      })
    }
  }

  function mapToPgn(conversion) {
    unsubscribes.push(
      Bacon.combineWith(
        conversion.callback,
        conversion.keys.map(app.streambundle.getSelfStream, app.streambundle)
      )
        .changes()
        .debounceImmediate(20)
        .map(toPgn)
        .onValue(pgnBuffer => {
          if (pgnBuffer) {
            const msg = toActisenseSerialFormat(conversion.pgn, pgnBuffer);
            debug("emit " + msg);
            app.emit("nmea2000out", msg);
          }
        })
    );
  }
  
  function mapToNmea(conversion) {
    const selfStreams = conversion.keys.map(
      app.streambundle.getSelfStream,
      app.streambundle
    );
    unsubscribes.push(
      Bacon.combineWith(conversion.callback, selfStreams)
        .changes()
        .debounceImmediate(20)
        .onValue(pgns => processPGNs(pgns))
    )
  }
  
  function mapOnDelta(conversion) {
    app.signalk.on('delta', (delta) => {
      try {
        processPGNs(conversion.callback(delta))
      } catch ( err ) {
        console.log(err)
      }
    })
  }

  function mapTimer(conversion) {
    timers.push(setInterval(() => {
      processPGNs(conversion.callback(app))
    }, conversion.interval));
  }
};

