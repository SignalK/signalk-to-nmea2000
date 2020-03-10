
module.exports = (app, plugin) => {
  return {
    pgns: [ 130311 ],
    title: 'Atmospheric Pressure (130311)',
    optionKey: 'ENVIRONMENT_PARAMETERS',
    keys: ["environment.outside.pressure"],

    callback: (pressure) => {
      try {
        return [
          {
            pgn: 130311,
            "Atmospheric Pressure": pressure,
          }
        ]
      } catch ( err ) {
        console.error(err)
      }
    }
  }
}
