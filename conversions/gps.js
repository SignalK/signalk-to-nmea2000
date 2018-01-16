const _ = require('lodash')
const Concentrate = require("concentrate");
const debug = require("debug")("signalk:signalk-to-nmea2000");
//const bignum = require('bignum')
const Int64LE = require('int64-buffer').Int64LE

module.exports = (app, plugin) => {
  var lastUpdate = null
  
  return {
    title: 'Location (129025)',
    type: 'toN2K',
    optionKey: 'GPS_LOCATION',
    keys: ["navigation.position"],
    callback: (position) => {
      //debug(`position: ${JSON.stringify(position)}`)
      var dateObj = new Date();
      var date = Math.trunc(dateObj.getTime() / 86400 / 1000);
      var time =
          dateObj.getUTCHours() * (60 * 60) +
          dateObj.getUTCMinutes() * 60 +
          dateObj.getUTCSeconds();
      time = time * 10000;
      var res = [
        {
          pgn: 129025,
          buffer: Concentrate()
            .int32(position.latitude * 10000000)
            .int32(position.longitude * 10000000)
            .result()
        }
      ]


      if (
        lastUpdate == null ||
          (new Date().getTime() - lastUpdate.getTime()) > 1000
      )  {
        lastUpdate = new Date()
        var lat = (position.latitude * 10000000 * 10000000 * 100)
        var lon = (position.longitude * 10000000 * 10000000 * 100)

        var rest = new Buffer(new Uint8Array([0xff,0xff,0xff,0xff,0xff,0xff,0xff,0x7f,0x23,0xfc,0x10,0x40,0x00,0xff,0x7f,0xff,0xff,0xff,0x7f,0x00]))
        
        res = res.concat([
          {
            pgn: 129029,
            buffer: Concentrate()
              .uint8(0xf3)
              .uint16(date)
              .uint32(time)
              .buffer(new Int64LE(lat).toBuffer())
              .buffer(new Int64LE(lon).toBuffer())
              .buffer(rest)
              .result()
          }
        ])
      }
      return res
    }
  }
}
