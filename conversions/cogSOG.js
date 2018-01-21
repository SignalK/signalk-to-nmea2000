const _ = require('lodash')
const Concentrate2 = require("concentrate2");
const debug = require("debug")("signalk:signalk-to-nmea2000");

module.exports = (app, plugin) => {
  var lastUpdate = null
  
  return {
    title: 'COG & SOG (129026)',
    optionKey: 'COG_SOG',
    keys: ["navigation.courseOverGroundTrue", "navigation.speedOverGround"],
    callback: (course, speed) => {
      try {
        return [
          {
            pgn: 129026,
            'COG Reference': 0,
            COG: course,
            SOG: speed
          }
        ]
      } catch ( err ) {
        console.error(err)
      }
    }
  }
}
