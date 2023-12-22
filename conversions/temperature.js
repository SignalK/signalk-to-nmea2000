
let tempMessage = (temp, inst, src) => {
  return [{
    pgn: 130312,
    SID: 0xff,
    "Instance": inst,
    "Source": src,
    "Actual Temperature": temp,
  }]
}

module.exports = (app, plugin) => {
  return [{
    pgn: 130312,
    title: 'Outside Temperature (130312)',
    optionKey: 'TEMPERATURE_OUTSIDE',
    keys: [
      "environment.outside.temperature"
    ],
    callback: (temperature) => {
      return tempMessage(temperature, 101, 1)
    },
    tests: [{
      input: [ 281.2 ],
      expected: [{
        "prio": 2,
        "pgn": 130312,
        "dst": 255,
        "fields": {
          "Instance": 101,
          "Source": "Outside Temperature",
          "Actual Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130312,
    title: 'Inside Temperature (130312)',
    optionKey: 'TEMPERATURE_INSIDE',
    keys: [
      "environment.inside.temperature"
    ],
    callback: (temperature) => {
      return tempMessage(temperature, 102, 2)
    },
    tests: [{
      input: [ 281.2 ],
      expected: [{
        "prio": 2,
        "pgn": 130312,
        "dst": 255,
        "fields": {
          "Instance": 102,
          "Source": "Inside Temperature",
          "Actual Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130312,
    title: 'Engine Room Temperature (130312)',
    optionKey: 'TEMPERATURE_ENGINEROOM',
    keys: [
      "environment.inside.engineRoom.temperature"
    ],
    callback: (temperature) => {
      return tempMessage(temperature, 103, 3)
    },
    tests: [{
      input: [ 281.2 ],
      expected: [{
        "prio": 2,
        "pgn": 130312,
        "dst": 255,
        "fields": {
          "Instance": 103,
          "Source": "Engine Room Temperature",
          "Actual Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130312,
    title: 'Refrigerator Temperature (130312)',
    optionKey: 'TEMPERATURE_refridgerator',
    keys: [
      "environment.inside.refrigerator.temperature"
    ],
    callback: (temperature) => {
      return tempMessage(temperature, 107, 7)
    },
    tests: [{
      input: [ 281.2 ],
      expected: [{
        "prio": 2,
        "pgn": 130312,
        "dst": 255,
        "fields": {
          "Instance": 107,
          "Source": "Refrigeration Temperature",
          "Actual Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130312,
    title: 'Freezer Temperature (130312)',
    optionKey: 'TEMPERATURE_FREEZER',
    keys: [
      "environment.inside.freezer.temperature"
    ],
    callback: (temperature) => {
      return tempMessage(temperature, 107, 13)
    },
    tests: [{
      input: [ 281.2 ],
      expected: [{
        "prio": 2,
        "pgn": 130312,
        "dst": 255,
        "fields": {
          "Instance": 107,
          "Source": "Freezer Temperature",
          "Actual Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130312,
    title: 'Main Cabin Temperature (130312)',
    optionKey: 'TEMPERATURE_MAINCABIN',
    keys: [
      "environment.inside.mainCabin.temperature"
    ],
    callback: (temperature) => {
      return tempMessage(temperature, 107, 4)
    },
    tests: [{
      input: [ 281.2 ],
      expected: [{
        "prio": 2,
        "pgn": 130312,
        "dst": 255,
        "fields": {
          "Instance": 107,
          "Source": "Main Cabin Temperature",
          "Actual Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130312,
    title: 'Heating System Temperature (130312)',
    optionKey: 'TEMPERATURE_HEATINGSYSTEM',
    keys: [
      "environment.inside.heating.temperature"
    ],
    callback: (temperature) => {
      return tempMessage(temperature, 107, 8)
    },
    tests: [{
      input: [ 281.2 ],
      expected: [{
        "prio": 2,
        "pgn": 130312,
        "dst": 255,
        "fields": {
          "Instance": 107,
          "Source": "Heating System Temperature",
          "Actual Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130312,
    title: 'Dew Point Temperature (130312)',
    optionKey: 'TEMPERATURE_DEWPOINT',
    keys: [
      "environment.outside.dewPointTemperature"
    ],
    callback: (temperature) => {
      return tempMessage(temperature, 107, 9)
    },
    tests: [{
      input: [ 281.2 ],
      expected: [{
        "prio": 2,
        "pgn": 130312,
        "dst": 255,
        "fields": {
          "Instance": 107,
          "Source": "Dew Point Temperature",
          "Actual Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130312,
    title: 'Apparent Wind Chill Temperature (130312)',
    optionKey: 'TEMPERATURE_APPARENTWINDCHILL',
    keys: [
      "environment.outside.apparentWindChillTemperature"
    ],
    callback: (temperature) => {
      return tempMessage(temperature, 107, 10)
    },
    tests: [{
      input: [ 281.2 ],
      expected: [{
        "prio": 2,
        "pgn": 130312,
        "dst": 255,
        "fields": {
          "Instance": 107,
          "Source": "Apparent Wind Chill Temperature",
          "Actual Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130312,
    title: 'Theoretical Wind Chill Temperature (130312)',
    optionKey: 'TEMPERATURE_THEORETICALWINDCHILL',
    keys: [
      "environment.outside.theoreticalWindChillTemperature"
    ],
    callback: (temperature) => {
      return tempMessage(temperature, 107, 11)
    },
    tests: [{
      input: [ 281.2 ],
      expected: [{
        "prio": 2,
        "pgn": 130312,
        "dst": 255,
        "fields": {
          "Instance": 107,
          "Source": "Theoretical Wind Chill Temperature",
          "Actual Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130312,
    title: 'Heat Index Temperature (130312)',
    optionKey: 'TEMPERATURE_HEATINDEX',
    keys: [
      "environment.outside.heatIndexTemperature"
    ],
    callback: (temperature) => {
      return tempMessage(temperature, 107, 12)
    },
    tests: [{
      input: [ 281.2 ],
      expected: [{
        "prio": 2,
        "pgn": 130312,
        "dst": 255,
        "fields": {
          "Instance": 107,
          "Source": "Heat Index Temperature",
          "Actual Temperature": 281.2
        }
      }]
    }]
  }
  ]
}
