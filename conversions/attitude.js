
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
    }
  }
}
