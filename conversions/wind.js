
module.exports = (app, plugin) => {
  return {
    title: 'Wind (130306)',
    optionKey: 'WINDv2',
    pgns: [ 130306 ],
    keys: ["environment.wind.angleApparent", "environment.wind.speedApparent"],
    callback: (angle, speed) => {
      try {
        return [
          {
            pgn: 130306,
            'Wind Speed': speed,
            'Wind Angle': angle < 0 ? angle + Math.PI*2 : angle,
            'Reference': 2
          }
        ]
      } catch ( err ) {
        console.error(err)
      }
    }
  }
}

