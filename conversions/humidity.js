
let tempMessage = (hum, inst, src) => {
    return [{
      pgn: 130313,
      SID: 0xff,
      "Instance": inst,
      "Source": src,
      "Actual Humidity": hum,
    }]
  }
  
  module.exports = (app, plugin) => {
    return [{
      pgn: 130313,
      title: 'Outside Humidity (130313)',
      optionKey: 'HUMIDITY_OUTSIDE',
      keys: [
        "environment.outside.relativeHumidity"
      ],
      callback: (hum) => {
        return tempMessage(hum*100, 0, 1)
      },
    },
    {
      pgn: 130313,
      title: 'Inside Humidity (130313)',
      optionKey: 'HUMIDITY_INSIDE',
      keys: [
        "environment.inside.relativeHumidity"
      ],
      callback: (hum) => {
        return tempMessage(hum*100, 0, 0)
      }
    }]
  }
  