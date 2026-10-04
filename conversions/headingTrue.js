module.exports = (app, plugin) => {
  return {
    pgn: 127250,
    title: 'Heading true (127250)',
    optionKey: 'HEADINGTRUE',
    keys: [
      "navigation.headingTrue"
    ],
    callback: (heading) => {
      return [{
        pgn: 127250,
        SID: 87,
        Heading: heading,
        Reference: "True"
      }]
    },
    tests: [{
      input: [ 1.2],
      expected: [{
        "prio": 2,
        "pgn": 127250,
        "dst": 255,
        "fields": {
          "SID": 87,
          "Heading": 1.2,
          "Reference": "True"
        }
      }]
    }]
  }
}
