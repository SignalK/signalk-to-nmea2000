
module.exports = (app, plugin) => {
  return {
    title: 'Wind True over water (130306)',
    optionKey: 'WIND_TRUE',
    keys: ["environment.wind.angleTrueWater", "environment.wind.speedTrue"],
    callback: (angle, speed) => {
      try {
        return [
          {
            pgn: 130306,
            'Wind Speed': speed,
            'Wind Angle': angle < 0 ? angle + Math.PI*2 : angle,
            'Reference': 3
          }
        ]
      } catch ( err ) {
        console.error(err)
      }
    }
  }
}

