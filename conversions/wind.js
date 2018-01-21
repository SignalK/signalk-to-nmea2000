const Concentrate2 = require("concentrate2");

module.exports = (app, plugin) => {
  return {
    title: 'Wind (130306)',
    optionKey: 'WIND',
    keys: ["environment.wind.angleApparent", "environment.wind.speedApparent"],
    callback: (angle, speed) => {
      console.log(`${angle} ${speed}`)
      try {
        return [
          {
            pgn: 130306,
            'Wind Speed': speed,
            'Wind Angle': angle < 0 ? angle + Math.PI*2 : angle,
            'Reference': 2
            /*
            buffer: Concentrate2()
              .uint8(0xff)
              .uint16((speed*100).toFixed(0))
              .uint16((angle * 10000).toFixed(0))
              .uint8(0xfa)
              .uint8(0xff)
              .uint8(0xff)
              .result()
            */
          }
        ]
      } catch ( err ) {
        console.error(err)
      }
    }
  }
}

