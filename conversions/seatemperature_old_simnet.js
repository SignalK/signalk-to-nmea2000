
module.exports = (app, plugin) => {
  return {
    title: 'Sea Temp - OLD Simnet (130311)',
    optionKey: 'ENVIRONMENT_PARAMETERS_SEA_OLD',
    keys: ["environment.water.temperature"],
    callback: (water) => {
      try {
        return [
          {
		  pgn: 130311,
		  //'temperatureSource': 0,
		  //'humiditySource': 1,
		  'temperature': water,
		  //'humidity': 75,
		  //'atmosphericPressure': 900,
          }
        ]
      } catch ( err ) {
        console.error(err)
      }
    }
  }
}

