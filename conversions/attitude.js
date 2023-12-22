
module.exports = (app, plugin) => {
  return {
    pgn: 127250,
    title: 'Attitude (127257)',
    optionKey: 'ATTITUDE',
    keys: [
      "navigation.attitude"
    ],
    callback: (attitude) => {
      return [{
        pgn: 127257,
        SID: 87,
        Pitch: attitude.pitch,
        Yaw: attitude.yaw,
        Roll: attitude.roll
      }]
    },
    tests: [
      {
        input: [ { 
          "yaw": 1.8843,
          "pitch": 0.042,
          "roll": 0.042
        } ],
        expected: [ {
          "dst": 255,
          "fields": {
            "Pitch": 0.042,
            "Roll": 0.042,
            "SID": 87,
            "Yaw": 1.8843,
          },
          "pgn": 127257,
          "prio": 2
        }]
      }
    ]
  }
}
