
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
    }
  }
}
