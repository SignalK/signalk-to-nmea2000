const _ = require('lodash')

module.exports = (app, plugin) => {
  var lastUpdate = null
  
  return {
    title: 'COG & SOG (129026)',
    optionKey: 'COG_SOGv2',
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
