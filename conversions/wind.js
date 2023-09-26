
module.exports = (app, plugin) => {
  return {
    title: 'Wind (130306)',
    optionKey: 'WINDv2',
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
    },

    tests: [
      {
        input: [ 2.0944, 1.2 ],
        expected: [
          {
            pgn: 130306,
            dst: 255,
            prio: 2,
            fields: {
              'Wind Speed': 1.2,
              'Wind Angle': 2.0944,
              'Reference': "Apparent"
            }
          }
        ]
      }
    ]
  }
}

