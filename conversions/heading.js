
module.exports = (app, plugin) => {
  return {
    pgn: 127250,
    title: 'Heading (127250)',
    optionKey: 'HEADINGv2',
    keys: [
      "navigation.headingMagnetic",
      'navigation.magneticVariation'
    ],
    callback: (heading, variation) => {
      return [{
        pgn: 127250,
        SID: 87,
        Heading: heading,
        "Variation": variation,
        Reference: "Magnetic"
      }]
    },
    tests: [{
      input: [ 1.2, 0.7 ],
      expected: [{
        "prio": 2,
        "pgn": 127250,
        "dst": 255,
        "fields": {
          "SID": 87,
          "Heading": 1.2,
          "Variation": 0.7,
          "Reference": "Magnetic"
        }
      }]
    }]
  }
}
