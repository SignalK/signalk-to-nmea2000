
module.exports = (app, plugin) => {
  return {
    pgn: 127250,
    title: 'TrueHeading (127250)',
    optionKey: 'TRUE_HEADING',
    keys: [
      "navigation.headingTrue"
    ],
    callback: (heading) => {
      return [{
        pgn: 127250,
        SID: 87,
        Heading: heading,
        "Variation": undefined,
        Reference: "True"
      }]
    },
    tests: [{
      input: [ 1.35, undefined ],
      expected: [{
        "prio": 2,
        "pgn": 127250,
        "dst": 255,
        "fields": {
          "SID": 87,
          "Heading": 1.35,
          "Variation": undefined,
          "Reference": "True"
        }
      }]
    }]
  }
}
