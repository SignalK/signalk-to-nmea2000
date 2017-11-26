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
              debug("emit: " + nmeaString);
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
      mapSubscription(AIS_STATIC_A);
      mapSubscription(AIS_STATIC_B);
      mapSubscription(AIS_POSITION)
    }
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
            debug("emit:" + msg);
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
          debug(`data ${JSON.stringify(data)}`)
          const msg = toActisenseSerialFormat(mapping.pgn, data);
          debug("emit:" + msg);
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

const AIS_STATIC_A = {
  pgn: 129809,
  context: "vessels.*",
  keys: [  "name",
           "mmsi" ],
  f: function(app, delta) {
    var selfContext = 'vessels.' + app.selfId

    if ( delta.context == selfContext ) {
      return
    }

    //debug("delta: " + JSON.stringify(delta))
    
    var vessel = _.get(app.signalk.root, delta.context)
    var mmsi = _.get(vessel, "mmsi");
    var name = _.get(vessel, "name");

    if ( mmsi && name )
    {
      mmsi = parseInt(mmsi, 10)
      var data = [
        0x18,
        mmsi & 0xff,
        (mmsi >> 8) & 0xff,
        (mmsi >> 16) & 0xff,
        (mmsi >> 24) & 0xff
      ]
      
      var i
      for ( i = 0; i < name.length && i < 20; i++ )
      {
        data.push(name.charCodeAt(i))
      }
      
      for ( ; i < 20; i++ )
      {
        data.push(0x40)
      }
      data.push(0x02)
      data.push(0xff)

      return data
    } else {
      return null
    }
  }
}

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

const AIS_STATIC_B = {
  pgn: 129810,
  context: "vessels.*",
  keys: [  "design.aisShipType",
           "design.draft",
           "design.length",
           "design.beam",
           "sensors.ais.fromCenter",
           "sensors.ais.fromBow" ],
  f: function(app, delta) {
    var selfContext = 'vessels.' + app.selfId

    if ( delta.context == selfContext ) {
      return
    }

    var vessel = _.get(app.signalk.root, delta.context)
    var mmsi = _.get(vessel, "mmsi");
    var type = _.get(vessel, "design.aisShipType.value.id")
    var callsign = _.get(vessel, "communication.callsignVhf")
    var length = _.get(vessel, 'design.length.value.overall')
    var beam = _.get(vessel, 'design.beam.value')
    var fromCenter = _.get("sensors.ais.fromCenter.value")
    var fromBow = _.get('sensors.ais.fromBow.value')

    type = type ? type : 0
    callsign = fillASCII(callsign ? callsign : '0')
    length = length ? length : 0xffff;
    beam = beam ? beam : 0xffff;

    var fromStarboard = 0xffff
    if ( beam && fromCenter ) {
      fromStarboard = beam / 2 + fromCenter
    }
    fromBow = fromBow ? fromBow : 0xffff
    
    mmsi = parseInt(mmsi, 10)
    var data = [
      0x18,
      mmsi & 0xff,
      (mmsi >> 8) & 0xff,
      (mmsi >> 16) & 0xff,
      (mmsi >> 24) & 0xff,
      type & 0xff,
      'S'.charCodeAt(0),
      'K'.charCodeAt(0),
      0x40,
      0x40,
      0x40,
      0x40,
      0x40,
      callsign[0],
      callsign[1],
      callsign[2],
      callsign[3],
      callsign[4],
      callsign[5],
      callsign[6],
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
      00,
      0xff
    ];
      
    return data
  }
}

const AIS_POSITION = {
  pgn: 129039,
  context: "vessels.*",
  keys: ["navigation.position",
         "navigation.courseOverGroundTrue",
         "navigation.speedOverGround",
         "navigation.headingTrue"
        ],
  f: function(app, delta) {
    var selfContext = 'vessels.' + app.selfId

    if ( delta.context == selfContext ) {
      return
    }

    var vessel = _.get(app.signalk.root, delta.context)
    var mmsi = _.get(vessel, "mmsi");
    var latitude = _.get(vessel, 'navigation.position.value.latitude')
    var longitude = _.get(vessel, 'navigation.position.value.longitude')

    if ( latitude && longitude ) {
      var cog = _.get(vessel, 'navigation.courseOverGroundTrue.value')
      var sog = _.get(vessel, 'navigation.speedOverGround.value')
      var heading = _.get(vessel, 'navigation.headingTrue');

      cog = cog ? cog : 0xffff;
      sog = sog ? sog : 0xffff;
      heading = heading ? heading : 0xffff;
    
      mmsi = parseInt(mmsi, 10)
      var data = [
        0x78,
        mmsi & 0xff,
        (mmsi >> 8) & 0xff,
        (mmsi >> 16) & 0xff,
        (mmsi >> 24) & 0xff,
        latitude & 0xff,
        (latitude >> 8) & 0xff,
        (latitude >> 16) & 0xff,
        (latitude >> 24) & 0xff,
        longitude & 0xff,
        (longitude >> 8) & 0xff,
        (longitude >> 16) & 0xff,
        (longitude >> 24) & 0xff,
        0x3a,
        cog & 0xff,
        (cog >> 8) & 0xff,
        (cog >> 16) & 0xff,
        (cog >> 24) & 0xff,
        sog & 0xff,
        (sog >> 8) & 0xff,
        (sog >> 16) & 0xff,
        (sog >> 24) & 0xff,
        0xff,
        0x00,
        0x74,
        0x01,
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


function toActisenseSerialFormat(pgn, data) {
  return (
    "1970-01-01T00:00:00.000,4," +
    pgn +
    ",43,255," +
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
