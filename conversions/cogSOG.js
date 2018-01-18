const _ = require('lodash')
const Concentrate2 = require("concentrate2");
const debug = require("debug")("signalk:signalk-to-nmea2000");

module.exports = (app, plugin) => {
  var lastUpdate = null
  
  return {
    title: 'COG & SOG (129026)',
    type: 'toN2K',
    optionKey: 'COG_SOG',
    keys: ["navigation.courseOverGroundTrue", "navigation.speedOverGround"],
    callback: (course, speed) => {
      try {
        return [
          {
            pgn: 129026,
            buffer: Concentrate2()
              .uint8(0xff)
              .uint8(0xfc)
              .uint16((course * 10000).toFixed(0))
              .uint16((speed*100).toFixed(0))
              .uint16(0xffff)
              .result()
          }
        ]
      } catch ( err ) {
        console.error(err)
      }
    }
  }
}
