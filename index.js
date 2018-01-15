const Bacon = require("baconjs");
const debug = require("debug")("signalk:signalk-to-nmea2000");
const util = require("util");
const toPgn = require("to-n2k").toPgn;
const _ = require('lodash')

module.exports = function(app) {
  var plugin = {};
  var unsubscribes = [];
  var timer;

  plugin.id = "sk-to-nmea2000";
  plugin.name = "Convert Signal K to NMEA2000";
  plugin.description = "Plugin to convert Signal K to NMEA2000";

  plugin.schema = {
    type: "object",
    title: "Conversions to NMEA2000",
    description:
      "If there is SK data for the conversion generate the following NMEA2000 pgns from Signal K data:",
    properties: {
      WIND: {
        title: "130306 Wind",
        type: "boolean",
        default: false
      },
      GPS_LOCATION: {
        title: "129025 Location",
        type: "boolean",
        default: false
      },
      SYSTEM_TIME: {
        title: "126992 System Time",
        type: "boolean",
        default: false
      },
      HEADING: {
        title: "127250 Heading",
        type: "boolean",
        default: false
      },
      AIS: {
        title: "AIS",
        type: "boolean",
        default: false
      }
    }
  };
  plugin.start = function(options) {
    debug("start");

    function mapToNmea(encoder) {
      const selfStreams = encoder.keys.map(
        app.streambundle.getSelfStream,
        app.streambundle
      );
      unsubscribes.push(
        Bacon.combineWith(encoder.f, selfStreams)
          .changes()
          .debounceImmediate(20)
          .onValue(nmeaString => {
            if (nmeaString) {
              debug("emit " + nmeaString);
              app.emit("nmea2000out", nmeaString);
            }
          })
      );
    }

    if (options.WIND) {
      mapToNmea(WIND);
    }
    if (options.GPS_LOCATION) {
      mapToNmea(GPS_LOCATION);
    }
    if (options.SYSTEM_TIME) {
      timer = setInterval(send_date, 1000, app);
    }
    if (options.HEADING) {
      mapToPgn(HEADING_127250);
    }
    if (options.AIS) {
      /*mapSubscription(AIS_STATIC_A);
      mapSubscription(AIS_STATIC_B);
      mapSubscription(AIS_POSITION)*/

      mapSubscription(AIS_CLASSA_STATIC)
      mapSubscription(AIS_CLASSA_POSITION)
    }
    app.on('unknownN2K', unknownN2K)
  };

  plugin.stop = function() {
    unsubscribes.forEach(f => f());
    unsubscribes = [];
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return plugin;

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

  function mapToPgn(mapping) {
    unsubscribes.push(
      Bacon.combineWith(
        mapping.f,
        mapping.keys.map(app.streambundle.getSelfStream, app.streambundle)
      )
        .changes()
        .debounceImmediate(20)
        .map(toPgn)
        .onValue(pgnBuffer => {
          if (pgnBuffer) {
            const msg = toActisenseSerialFormat(mapping.pgn, pgnBuffer);
            debug("emit " + msg);
            app.emit("nmea2000out", msg);
          }
        })
    );
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

};

function padd(n, p, c) {
  var pad_char = typeof c !== "undefined" ? c : "0";
  var pad = new Array(1 + p).join(pad_char);
  return (pad + n).slice(-pad.length);
}

const wind_format = "%s,2,130306,1,255,8,ff,%s,%s,%s,%s,fa,ff,ff";

const WIND = {
  keys: ["environment.wind.angleApparent", "environment.wind.speedApparent"],
  f: function wind(angle, speed) {
    speed = speed * 100;
    angle = Math.trunc(angle * 10000);
    return util.format(
      wind_format,
      new Date().toISOString(),
      padd((speed & 0xff).toString(16), 2),
      padd(((speed >> 8) & 0xff).toString(16), 2),
      padd((angle & 0xff).toString(16), 2),
      padd(((angle >> 8) & 0xff).toString(16), 2)
    );
  }
};

const location_format = "%s,7,129025,1,255,8,%s,%s,%s,%s,%s,%s,%s,%s";

const GPS_LOCATION = {
  keys: ["navigation.position"],
  f: function location(pos) {
    var lat = pos.latitude * 10000000;
    var lon = pos.longitude * 10000000;
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
    );
  }
};

const system_time_format = "%s,3,126992,1,255,8,ff,ff,%s,%s,%s,%s,%s,%s";

function send_date(app) {
  var dateObj = new Date();
  var date = Math.trunc(dateObj.getTime() / 86400 / 1000);
  var time =
    dateObj.getUTCHours() * (60 * 60) +
    dateObj.getUTCMinutes() * 60 +
    dateObj.getUTCSeconds();
  time = time * 10000;
  msg = util.format(
    system_time_format,
    new Date().toISOString(),
    padd((date & 0xff).toString(16), 2),
    padd(((date >> 8) & 0xff).toString(16), 2),
    padd((time & 0xff).toString(16), 2),
    padd(((time >> 8) & 0xff).toString(16), 2),
    padd(((time >> 16) & 0xff).toString(16), 2),
    padd(((time >> 24) & 0xff).toString(16), 2)
  );
  debug("system time: " + msg);
  app.emit("nmea2000out", msg);
}

const HEADING_127250 = {
  pgn: 127250,
  keys: [
    "navigation.headingMagnetic"
    // ,'navigation.magneticVariation'
  ],
  f: (heading, variation) => {
    return {
      pgn: 127250,
      SID: 87,
      Heading: heading / 180 * Math.PI,
      // "Variation": variation,
      Reference: "Magnetic"
    };
  }
};

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

const AIS_CLASSA_STATIC = {
  pgn: 129794,
  context: "vessels.*",
  keys: [  "design.aisShipType",
           "design.draft",
           "design.length",
           "design.beam",
           "sensors.ais.fromCenter",
           "sensors.ais.fromBow" ],
  f: function(app, delta) {
    var selfContext = 'vessels.' + app.selfId

    if ( delta.context == selfContext || isN2K(delta) ) {
      return
    }


    var vessel = _.get(app.signalk.root, delta.context)
    var mmsi = _.get(vessel, "mmsi");
    var name = _.get(vessel, "name");
    var type = _.get(vessel, "design.aisShipType.value.id")
    var callsign = _.get(vessel, "communication.callsignVhf")
    var length = _.get(vessel, 'design.length.value.overall')
    var beam = _.get(vessel, 'design.beam.value')
    var fromCenter = _.get(vessel, "sensors.ais.fromCenter.value")
    var fromBow = _.get(vessel, 'sensors.ais.fromBow.value')
    var draft = _.get(vessel, 'design.draft.value.maximum')
    var imo = _.get('vessel', 'registrations.imo')
    
    if ( !mmsi ) {
      return null;
    }

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
      return
    }

    var vessel = _.get(app.signalk.root, delta.context)
    var mmsi = _.get(vessel, "mmsi");
    var latitude = _.get(vessel, 'navigation.position.value.latitude')
    var longitude = _.get(vessel, 'navigation.position.value.longitude')

    if ( latitude && longitude ) {
      var cog = _.get(vessel, 'navigation.courseOverGroundTrue.value')
      var sog = _.get(vessel, 'navigation.speedOverGround.value')
      var heading = _.get(vessel, 'navigation.headingTrue.value');
      var rot = _.get(vessel, 'navigation.rateOfTurn.value')

      cog = _.isUndefined(cog) ? 0xffff : (Math.trunc(cog * 10000))
      sog = _.isUndefined(sog) ? 0xffff : (sog*100);
      heading = _.isUndefined(heading) ? 0xffff : (Math.trunc(heading * 10000))
      rot = _.isUndefined(rot) ? 0xffff : rot

      latitude = latitude * 10000000;
      longitude = longitude * 10000000;

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
