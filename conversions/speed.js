
module.exports = (app, plugin) => {
  return {
	pgn: 128259,
    title: 'Speed (128259)',
    optionKey: 'SPEED',
    keys: [
	  "navigation.speedThroughWater"
	],
    callback: (speed) => {
      try {
        return [
          {
            pgn: 128259,
			"Speed Water Referenced": speed,
          }
        ]
      } catch ( err ) {
        console.error(err)
      }
    }
  }
}
