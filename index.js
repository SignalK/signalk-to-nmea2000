const Bacon = require("baconjs");
const debug = require("debug")("signalk:signalk-to-nmea2000");
const util = require("util");
const toPgn = require("to-n2k").toPgn;

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
      BATTERYSTATUS: {
        title: "127508 Battery status",
        type: "boolean",
        default: false
      }
    }
  };
  plugin.start = function(options) {
    debug("start");
    const selfContext = "vessels." + app.selfId;
    const selfMatcher = delta => delta.context && delta.context === selfContext;

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
    if (options.BATTERYSTATUS) {
      mapToPgn(BATTERY_STATUS_127508)
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
        mapping.keys
          .map(app.streambundle.getSelfStream, app.streambundle)
          .map(s => s.toProperty(undefined))
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
};

function padd(n, p, c) {
  var pad_char = typeof c !== "undefined" ? c : "0";
  var pad = new Array(1 + p).join(pad_char);
  return (pad + n).slice(-pad.length);
}

const wind_format = "%s,2,130306,1,255,8,ff,%s,%s,%s,%s,fa,ff,ff";

var WIND = {
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

var GPS_LOCATION = {
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

const BATTERY_STATUS_127508 = {
  pgn: 127508,
  keys: [
    "electrical.batteries.house.voltage",
    "electrical.batteries.house.current",
    "electrical.batteries.house.temperature"
  ],
  f: (voltage, current, temperature) => {
    return {
      pgn: 127508,
      "Battery Instance": 0,
      Voltage: voltage,
      Current: current,
      Temperature: temperature,
      SID: 18
    };
  }
};

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
