
module.exports = (app, plugin) => {
  return {
    title: 'Sea/Air Temp (130310)',
    optionKey: 'ENVIRONMENT_PARAMETERS_SEA',
    keys: ["environment.water.temperature", "environment.outside.temperature", "environment.outside.pressure"],
    callback: (water, air, pressure) => {
      try {
        return [
          {
		  pgn: 130310,
		  SID: 0xff,
		  "Water Temperature": water,
		  "Outside Ambient Air Temperature": air,
		  "Atmospheric Pressure": pressure
          }
        ]
      } catch ( err ) {
        console.error(err)
      }
    },
    tests: [{
      input: [ 281.2, 291, 20100 ],
      expected: [{
        "prio": 2,
        "pgn": 130310,
        "dst": 255,
        "fields": {
          "Water Temperature": 281.2,
          "Outside Ambient Air Temperature": 291,
          "Atmospheric Pressure": 20100
        }
      }]
    }]
  }
}
