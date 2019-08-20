
let tempMessage = (temp, inst, src) => {
  return [{
    pgn: 130312,
    SID: 0xff,
    "Temperature Instance": inst,
    "Instance": inst,
    "Temperature Source": src,
    "Actual Temperature": temp,
  }]
}

module.exports = (app, plugin) => {
  return [{
    pgn: 130312,
    title: 'Outside Temperature (130312)',
    optionKey: 'TEMPERATURE_OUTSIDE',
    pgns: [ 130312 ],
    keys: [
      "environment.outside.temperature"
    ],
    callback: (temperature) => {
      return tempMessage(temperature, 101, 1)
    },
  },
  {
    pgn: 130312,
    title: 'Inside Temperature (130312)',
    optionKey: 'TEMPERATURE_INSIDE',
    pgns: 130312,
    keys: [
      "environment.inside.temperature"
    ],
    callback: (temperature) => {
      return tempMessage(temperature, 102, 2)
    }
  },
  {
    pgn: 130312,
    title: 'Engine Room Temperature (130312)',
    optionKey: 'TEMPERATURE_ENGINEROOM',
    pgns: [ 130312 ],
    keys: [
      "environment.inside.engineRoom.temperature"
    ],
    callback: (temperature) => {
      return tempMessage(temperature, 103, 3)
    }
  },
  {
    pgn: 130312,
    title: 'Refridgerator Temperature (130312)',
    optionKey: 'TEMPERATURE_refridgerator',
    pgns: [ 130312 ],
    keys: [
      "environment.inside.refrigerator.temperature"
    ],
    callback: (temperature) => {
      return tempMessage(temperature, 107, 7)
    }
  }
  ]
}
