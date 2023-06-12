
module.exports = (app, plugin) => {
  return {
    title: 'Sea/Air Temp OLD Simnet (130311)',
    optionKey: 'ENVIRONMENT_PARAMETERS_SEA_OLD',
    keys: ["environment.water.temperature"],
    callback: (water) => {
      try {
        return [
          {
		  pgn: 130311,
		  //SID: 0xff,
		  "Water Temperature": water
          }
        ]
      } catch ( err ) {
        console.error(err)
      }
    }
  }
}
