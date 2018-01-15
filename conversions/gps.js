const Concentrate = require("concentrate");

module.exports = (app, plugin) => {
  return {
    title: 'Location (129025)',
    type: 'toN2K',
    optionKey: 'GPS_LOCATION',
    keys: ["navigation.position"],
    callback: (position) => {
      return [
        {
          pgn: 129025,
          buffer: Concentrate()
            .int32(position.latitude * 10000000)
            .int32(position.longitude * 10000000)
            .result()
        }
      ]
    }
  }
}
