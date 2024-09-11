
let tempMessage = (temp, inst, src) => {
  return [{
    pgn: 130316,
    SID: 0xff,
    "Instance": inst,
    "Source": src,
    "Temperature": temp,
  }]
}

module.exports = (app, plugin) => {
  return [{
    pgn: 130316,
    title: 'Outside Temperature (130316)',
    optionKey: 'TEMPERATURE2_OUTSIDE',
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
        "pgn": 130316,
        "dst": 255,
        "fields": {
          "Instance": 101,
          "Source": "Outside Temperature",
          "Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130316,
    title: 'Inside Temperature (130316)',
    optionKey: 'TEMPERATURE2_INSIDE',
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
        "pgn": 130316,
        "dst": 255,
        "fields": {
          "Instance": 102,
          "Source": "Inside Temperature",
          "Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130316,
    title: 'Engine Room Temperature (130316)',
    optionKey: 'TEMPERATURE2_ENGINEROOM',
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
        "pgn": 130316,
        "dst": 255,
        "fields": {
          "Instance": 103,
          "Source": "Engine Room Temperature",
          "Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130316,
    title: 'Refrigerator Temperature (130316)',
    optionKey: 'TEMPERATURE2_refridgerator',
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
        "pgn": 130316,
        "dst": 255,
        "fields": {
          "Instance": 107,
          "Source": "Refrigeration Temperature",
          "Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130316,
    title: 'Freezer Temperature (130316)',
    optionKey: 'TEMPERATURE2_FREEZER',
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
        "pgn": 130316,
        "dst": 255,
        "fields": {
          "Instance": 107,
          "Source": "Freezer Temperature",
          "Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130316,
    title: 'Main Cabin Temperature (130316)',
    optionKey: 'TEMPERATURE2_MAINCABIN',
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
        "pgn": 130316,
        "dst": 255,
        "fields": {
          "Instance": 107,
          "Source": "Main Cabin Temperature",
          "Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130316,
    title: 'Heating System Temperature (130316)',
    optionKey: 'TEMPERATURE2_HEATINGSYSTEM',
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
        "pgn": 130316,
        "dst": 255,
        "fields": {
          "Instance": 107,
          "Source": "Heating System Temperature",
          "Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130316,
    title: 'Dew Point Temperature (130316)',
    optionKey: 'TEMPERATURE2_DEWPOINT',
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
        "pgn": 130316,
        "dst": 255,
        "fields": {
          "Instance": 107,
          "Source": "Dew Point Temperature",
          "Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130316,
    title: 'Apparent Wind Chill Temperature (130316)',
    optionKey: 'TEMPERATURE2_APPARENTWINDCHILL',
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
        "pgn": 130316,
        "dst": 255,
        "fields": {
          "Instance": 107,
          "Source": "Apparent Wind Chill Temperature",
          "Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130316,
    title: 'Theoretical Wind Chill Temperature (130316)',
    optionKey: 'TEMPERATURE2_THEORETICALWINDCHILL',
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
        "pgn": 130316,
        "dst": 255,
        "fields": {
          "Instance": 107,
          "Source": "Theoretical Wind Chill Temperature",
          "Temperature": 281.2
        }
      }]
    }]
  },
  {
    pgn: 130316,
    title: 'Heat Index Temperature (130316)',
    optionKey: 'TEMPERATURE2_HEATINDEX',
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
        "pgn": 130316,
        "dst": 255,
        "fields": {
          "Instance": 107,
          "Source": "Heat Index Temperature",
          "Temperature": 281.2
        }
      }]
    }]
  }
  ]
}
