
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
    },
    tests: [{
      input: [ 2.0944, 1.2 ],
      expected: [
        {
          pgn: 130306,
          dst: 255,
          prio: 2,
          fields: {
            'Wind Speed': 1.2,
            'Wind Angle': 2.0944,
            'Reference': "True (boat referenced)"
          }
        }
      ]
    },{
      input: [ -2.0944, 1.5 ],
      expected: [
        {
          pgn: 130306,
          dst: 255,
          prio: 2,
          fields: {
            'Wind Speed': 1.5,
            'Wind Angle': 4.1888,
            'Reference': "True (boat referenced)"
          }
        }
      ]
    }]
  }
}

