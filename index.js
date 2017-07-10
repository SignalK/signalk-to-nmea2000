const Bacon = require('baconjs')
const debug = require('debug')('signalk:signalk-to-nmea2000')
const util = require('util')
const toPgn = require('to-n2k').toPgn
const _ = require('lodash')

module.exports = function (app) {
  var plugin = {}
  var unsubscribes = []
  var timer

  plugin.id = 'sk-to-nmea2000'
  plugin.name = 'Convert Signal K to NMEA2000'
  plugin.description = 'Plugin to convert Signal K to NMEA2000'

  plugin.schema = {
    type: 'object',
    title: 'Conversions to NMEA2000',
    description: 'If there is SK data for the conversion generate the following NMEA2000 pgns from Signal K data:',
    properties: {
      WIND: {
        title: '130306 Wind',
        type: 'boolean',
        default: false
      },
      GPS_LOCATION: {
        title: '129025 Location',
        type: 'boolean',
        default: false
      },
      SYSTEM_TIME: {
        title: '126992 System Time',
        type: 'boolean',
        default: false
      },
      HEADING: {
        title: '127250 Heading',
        type: 'boolean',
        default: false
      },
      AIS: {
        title: "AIS",
        type: "boolean",
        default: false
      },
      BATTERYSTATUS: {
        title: '127508 Battery status',
        type: 'array',
        items: {
          type: 'object',
          properties: {
            signalkId: {
              type: 'string',
              title: 'Signal K battery id'
            },
            instanceId: {
              type: 'number',
              title: 'NMEA2000 Battery Instance Id'
            }
          }
        }
      }
    }
  }

  function activateFastformat (encoder) {
    unsubscribes.push(
      timeoutingArrayStream(
        encoder.keys,
        encoder.timeouts,
        app.streambundle,
        unsubscribes
      )
        .map(values => encoder.f.call(this, ...values))
        .onValue(pgn => {
          if (pgn) {
            debug('emit: ' + pgn)
            app.emit('nmea2000out', pgn)
          }
        })
    )
  }

  function activatePgn (encoder) {
    unsubscribes.push(
      timeoutingArrayStream(
        encoder.keys,
        encoder.timeouts,
        app.streambundle,
        unsubscribes
      )
        .map(values => encoder.f.call(this, ...values))
        .map(toPgn)
        .onValue(pgnData => {
          if (pgnData) {
            const msg = toActisenseSerialFormat(encoder.pgn, pgnData)
            debug('emit:' + msg)
            app.emit('nmea2000out', msg)
          }
        })
    )
  }

  plugin.start = function (options) {
    debug('start')
    const selfContext = 'vessels.' + app.selfId
    const selfMatcher = delta => delta.context && delta.context === selfContext

    if (options.WIND) {
      activateFastformat(WIND, app.streambundle)
    }
    if (options.GPS_LOCATION) {
      activateFastformat(GPS_LOCATION, app.streambundle)
    }
    if (options.SYSTEM_TIME) {
      const timer = setInterval(send_date, 1000, app)
      unsubscribes.push(() => {
        clearTimeout(timer)
      })
    }
    if (options.HEADING) {
      activatePgn(HEADING_127250, app.streambundle)
    }
    if (options.AIS) {
      mapOnDelta(AIS_CLASSA_STATIC)
      mapOnDelta(AIS_CLASSA_POSITION)
    }
    if (options.BATTERYSTATUS) {
      options.BATTERYSTATUS.map(BATTERY_STATUS_127508).forEach(encoder => {
        activatePgn(encoder, app.streambundle)
      })
    }

    app.on('unknownN2K', unknownN2K)
  }

  function unknownN2K(chunk) {
    if ( chunk.pgn === 59904 && chunk.dst == 0 ) {
      if ( chunk.fields.PGN == 126464 ) {
        var pgn = 128267 //130306
        var data = [
          1,
          pgn & 0xff,
          (pgn >> 8) & 0xff,
          (pgn >> 16) & 0xff
        ]
        app.emit("nmea2000out", toActisenseSerialFormat(126464, data, chunk.src))
      }
    }
  }

  plugin.stop = function () {
    unsubscribes.forEach(f => f())
    unsubscribes = []
  }

  function subscription_error(err)
  {
    console.log("error: " + err)
  }
  
  function mapSubscription(mapping) {
    var subscription = {
      "context": mapping.context,
      subscribe: []
    }

    mapping.keys.forEach(key => {
      subscription.subscribe.push({ path: key})
    });

    debug("subscription: " + JSON.stringify(subscription))

    app.subscriptionmanager.subscribe(
      subscription,
      unsubscribes,
      subscription_error,
      delta => {
        var data = mapping.f(app, delta)
        if ( data ) {
          const msg = toActisenseSerialFormat(mapping.pgn, data);
          debug("emit " + msg);
          app.emit("nmea2000out", msg);
        }
      });
  }

  function mapOnDelta(mapping) {
    app.signalk.on('delta', (delta) => {
      var data = mapping.f(app, delta)
      if ( data ) {
        const msg = toActisenseSerialFormat(mapping.pgn, data);
        debug("emit " + msg);
        app.emit("nmea2000out", msg);
      }
    });
  }

  return plugin
}


function padd (n, p, c) {
  var pad_char = typeof c !== 'undefined' ? c : '0'
  var pad = new Array(1 + p).join(pad_char)
  return (pad + n).slice(-pad.length)
}

const wind_format = '%s,2,130306,1,255,8,ff,%s,%s,%s,%s,fa,ff,ff'

var WIND = {
  keys: ['environment.wind.angleApparent', 'environment.wind.speedApparent'],
  f: function wind (angle, speed) {
    speed = speed * 100
    angle = Math.trunc(angle * 10000)
    return util.format(
      wind_format,
      new Date().toISOString(),
      padd((speed & 0xff).toString(16), 2),
      padd(((speed >> 8) & 0xff).toString(16), 2),
      padd((angle & 0xff).toString(16), 2),
      padd(((angle >> 8) & 0xff).toString(16), 2)
    )
  }
}

const location_format = '%s,7,129025,1,255,8,%s,%s,%s,%s,%s,%s,%s,%s'

var GPS_LOCATION = {
  keys: ['navigation.position'],
  f: function location (pos) {
    var lat = pos.latitude * 10000000
    var lon = pos.longitude * 10000000
    return util.format(
      location_format,
      new Date().toISOString(),
      padd((lat & 0xff).toString(16), 2),
      padd(((lat >> 8) & 0xff).toString(16), 2),
      padd(((lat >> 16) & 0xff).toString(16), 2),
      padd(((lat >> 24) & 0xff).toString(16), 2),
      padd((lon & 0xff).toString(16), 2),
      padd(((lon >> 8) & 0xff).toString(16), 2),
      padd(((lon >> 16) & 0xff).toString(16), 2),
      padd(((lon >> 24) & 0xff).toString(16), 2)
    )
  }
}

const system_time_format = '%s,3,126992,1,255,8,ff,ff,%s,%s,%s,%s,%s,%s'

function send_date (app) {
  var dateObj = new Date()
  var date = Math.trunc(dateObj.getTime() / 86400 / 1000)
  var time =
    dateObj.getUTCHours() * (60 * 60) +
    dateObj.getUTCMinutes() * 60 +
    dateObj.getUTCSeconds()
  time = time * 10000
  msg = util.format(
    system_time_format,
    new Date().toISOString(),
    padd((date & 0xff).toString(16), 2),
    padd(((date >> 8) & 0xff).toString(16), 2),
    padd((time & 0xff).toString(16), 2),
    padd(((time >> 8) & 0xff).toString(16), 2),
    padd(((time >> 16) & 0xff).toString(16), 2),
    padd(((time >> 24) & 0xff).toString(16), 2)
  )
  debug('system time: ' + msg)
  app.emit('nmea2000out', msg)
}

const HEADING_127250 = {
  pgn: 127250,
  keys: [
    'navigation.headingMagnetic'
    // ,'navigation.magneticVariation'
  ],
  f: (heading, variation) => {
    return {
      pgn: 127250,
      SID: 87,
      Heading: heading / 180 * Math.PI,
      // "Variation": variation,
      Reference: 'Magnetic'
    }
  }
}

const BATTERY_STATUS_127508_ARG_NAMES = ['Voltage', 'Current', 'Temperature']
const BATTERY_STATUS_127508 = ({ signalkId, instanceId }) => ({
  pgn: 127508,
  keys: [
    `electrical.batteries.${signalkId}.voltage`,
    `electrical.batteries.${signalkId}.current`,
    `electrical.batteries.${signalkId}.temperature`
  ],
  timeouts: [1000, 1000, 1000],
  f: function () {
    const result = {
      pgn: 127508,
      'Battery Instance': instanceId,
      SID: 18
    }
    BATTERY_STATUS_127508_ARG_NAMES.forEach((argName, i) => {
      if (isDefined(arguments[i])) {
        result[argName] = arguments[i]
      }
    })
    return result
  }
})

function fillASCII(theString, len)
{
  var res = []
  var i
  for ( i = 0; i < len && i < theString.length; i++ )
  {
    res.push(theString.charCodeAt(i))
  }
  for ( ; i < len; i++ )
  {
    res.push(0x40)
  }
  return res;
}

function isN2K(delta) {
  var res = false
  if ( delta.updates ) {
    delta.updates.forEach(update => {
      var type = _.get(update, 'source.type')
      if ( type && type == 'NMEA2000' ) {
        res = true
      }
    });
  }
  return res
}

function hasAnyKeys(delta, keys) {
  if ( delta.updates ) {
    for ( var i = 0; i < delta.updates.length; i++ ) {
      for ( var j = 0; j < delta.updates[i].values.length; j++ ) {
        var valuePath = delta.updates[i].values[j].path
        var value = delta.updates[i].values[j].value

        if ( valuePath == '' ) {
          if ( _.intersection(_.keys(value), keys).length > 0 ) {
            return true
          }
        } else if ( keys.includes(valuePath) ) {
          return true
        }
      }
    }
  }
  return false
}

function findDeltaValue(delta, path) {
  if ( delta.updates ) {
    for ( var i = 0; i < delta.updates.length; i++ ) {
      for ( var j = 0; j < delta.updates[i].values.length; j++ ) {
        var valuePath = delta.updates[i].values[j].path
        var value = delta.updates[i].values[j].value
        if ( valuePath == '' && path.indexOf('.') == -1 ) {
          value =  _.get(value, path)
          if ( value ) {
            return value
          }
        } else if ( path == valuePath ) {
          return value
        }
      }
    }
  }
  return undefined
}

const AIS_CLASSA_STATIC = {
  pgn: 129794,
  context: "vessels.*",
  keys: [
    "name",
    "design.aisShipType",
    "design.draft",
    "design.length",
    "design.beam",
    "sensors.ais.fromCenter",
    "sensors.ais.fromBow" ,
    "design.draft",
    "registrations.imo"
  ],
  f: function(app, delta) {
    var selfContext = 'vessels.' + app.selfId

    if ( delta.context == selfContext || isN2K(delta) ) {
      return null
    }

    if ( !hasAnyKeys(delta, AIS_CLASSA_STATIC.keys) ) {
      return null
    }
    
    var vessel = _.get(app.signalk.root, delta.context)
    var mmsi = _.get(vessel, 'mmsi') || findDeltaValue(delta, 'mmsi');

    if ( !mmsi ) {
      return null;
    }
    
    var name = _.get(vessel, "name") || findDeltaValue(delta, 'name');
    
    var type = _.get(findDeltaValue(delta, "design.aisShipType"), "id")
    var callsign = findDeltaValue(delta, "communication.callsignVhf")
    var length = _.get(findDeltaValue(delta, 'design.length'), 'overall')
    var beam = findDeltaValue(delta, 'design.beam')
    var fromCenter = findDeltaValue(delta, 'sensors.ais.fromCenter')
    var fromBow = findDeltaValue(delta, 'sensors.ais.fromBow')
    var draft = _.get(findDeltaValue(delta, 'design.draft'), 'maximum')
    var imo = findDeltaValue(delta, 'registrations.imo')
    
    type = _.isUndefined(type) ? 0 : type
    callsign = fillASCII(callsign ? callsign : '0', 7)
    name = fillASCII(name ? name : '0', 20)
    length = length ? length * 10 : 0xffff;
    beam = beam ? beam * 10 : 0xffff;
    draft = _.isUndefined(draft) ? 0xffff : draft * 100

    if ( _.isUndefined(imo) ) {
      imo = 0
    } else {
      var parts = imo.split(imo)
      imo = Number(parts[parts.length-1])
    }

    var fromStarboard = 0xffff
    if ( beam && fromCenter ) {
      fromStarboard = (beam / 2 + fromCenter) * 10
    }
    fromBow = fromBow ? fromBow * 10 : 0xffff

    //2017-04-15T14:58:37.625Z,6,129794,43,255,76,05,28,e0,42,0f,0f,ee,8c,00,39,48,41,33,37,39,35,41,54,4c,41,4e,54,49,43,20,50,52,4f,4a,45,43,54,20,49,49,40,4f,8a,07,18,01,8c,00,fe,06,de,44,00,cc,bf,19,e8,03,52,55,20,4c,45,44,20,3e,20,55,53,20,42,41,4c,40,40,40,40,40,04,00,ff
    
    mmsi = parseInt(mmsi, 10)
    var data = [
      0x05,
      mmsi & 0xff,
      (mmsi >> 8) & 0xff,
      (mmsi >> 16) & 0xff,
      (mmsi >> 24) & 0xff,
      imo & 0xff,
      (imo >> 8) & 0xff,
      (imo >> 16) & 0xff,
      (imo >> 24) & 0xff
    ]

    data = data.concat(callsign)
    data = data.concat(name)
    
    data = data.concat([
      type & 0xff,
      length & 0xff,
      (length >> 8) & 0xff,
      beam & 0xff,
      (beam >> 8) & 0xff,
      fromStarboard & 0xff,
      (fromStarboard >> 8) & 0xff,
      fromBow & 0xff,
      (fromBow >> 8) & 0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      0xff,
      draft & 0xff,
      (draft >> 8 ) & 0xff
    ])

    var dest = fillASCII('0', 20)
    data = data.concat(dest)
    
    data = data.concat([
      0x05,
      0x00,
      0xff
    ])

    return data
  }
}

const AIS_CLASSA_POSITION = {
  pgn: 129038,
  context: "vessels.*",
  keys: ["navigation.position" ],
  f: function(app, delta) {
    var selfContext = 'vessels.' + app.selfId

    if ( delta.context == selfContext || isN2K(delta) ) {
      return null
    }

    if ( !hasAnyKeys(delta, AIS_CLASSA_POSITION.keys) ) {
      return null
    }

    var vessel = _.get(app.signalk.root, delta.context)
    var mmsi = _.get(vessel, 'mmsi') || findDeltaValue(delta, 'mmsi');
    
    if ( !mmsi ) {
      debug(`no mmsi:${JSON.stringify(delta)}`)
      return null
    }
    
    var position = findDeltaValue(delta, 'navigation.position')

    if ( position && position.latitude && position.longitude ) {
      var cog = findDeltaValue(delta, 'navigation.courseOverGroundTrue')
      var sog = findDeltaValue(delta, 'navigation.speedOverGround')
      var heading = findDeltaValue(delta, 'navigation.headingTrue');
      var rot = findDeltaValue(delta, 'navigation.rateOfTurn')

      cog = _.isUndefined(cog) ? 0xffff : (Math.trunc(cog * 10000))
      sog = _.isUndefined(sog) ? 0xffff : (sog*100);
      heading = _.isUndefined(heading) ? 0xffff : (Math.trunc(heading * 10000))
      rot = _.isUndefined(rot) ? 0xffff : rot

      var latitude = position.latitude * 10000000;
      var longitude = position.longitude * 10000000;

      /*
      2017-04-15T15:06:37.589Z,4,129038,43,255,28,

      01,
      ae,e7,e0,15, mmsi
      36,5c,76,d2, lon
      93,0b,52,17, lat
      94, RAIM/TS
      4d,e9, COG
      39,01, SOG
      7e,05,01,
      ff,ff, heading
      ff,7f, rat
      01,
      00, Nav Status, reserved
      ff reserved
      */
      
      mmsi = parseInt(mmsi, 10)
      var data = [
        0x01,
        mmsi & 0xff,
        (mmsi >> 8) & 0xff,
        (mmsi >> 16) & 0xff,
        (mmsi >> 24) & 0xff,
        longitude & 0xff,
        (longitude >> 8) & 0xff,
        (longitude >> 16) & 0xff,
        (longitude >> 24) & 0xff,
        latitude & 0xff,
        (latitude >> 8) & 0xff,
        (latitude >> 16) & 0xff,
        (latitude >> 24) & 0xff,
        0x94, 
        cog & 0xff,
        (cog >> 8) & 0xff,
        sog & 0xff,
        (sog >> 8) & 0xff,
        0x7e,
        0x05,
        0x01,
        heading & 0xff,
        (heading >> 8) & 0xff,
        rot & 0xff,
        (rot >> 8 ) & 0xff, 
        0xff,
        0xff
      ];
      
      return data
    } else {
      debug('no position')
      return null
    }
  }
}


const AIS_ATON = {
  pgn: 129041,
  context: "atons.*",
  keys: ["navigation.position",
         "mmsi",
         "name",
         "atonType",
         "design.length",
         "design.beam",
         "sensors.ais.fromCenter",
         "sensors.ais.fromBow"],
  f: function(app, delta) {
  }
}


function toActisenseSerialFormat (pgn, data) {
  return (
    '1970-01-01T00:00:00.000,4,' +
    pgn +
    ',43,255,' +
    data.length +
    ',' +
    new Uint32Array(data)
      .reduce(function (acc, i) {
        acc.push(i.toString(16))
        return acc
      }, [])
      .map(x => (x.length === 1 ? '0' + x : x))
      .join(',')
  )
}

function timeoutingArrayStream (
  keys,
  timeouts = [],
  streambundle,
  unsubscribes
) {
  debug(`keys:${keys}`)
  debug(`timeouts:${timeouts}`)
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
  if (debug.enabled) {
    unsubscribes.push(result.onValue(x => debug(`${keys}:${x}`)))
  }
  return result
}

const notDefined = x => typeof x === 'undefined'
const isDefined = x => typeof x !== 'undefined'
