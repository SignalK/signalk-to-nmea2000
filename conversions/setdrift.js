
module.exports = (app, plugin) => {
  return {
    title: 'Set/Drift (129291)',
    optionKey: 'SetDrift',
    keys: ["environment.current.setTrue", "environment.current.drift"],
    callback: (set, drift) => {
      try {
        return [
          {
            pgn: 129291,
            'Set': set,
            'Drift': drift,
            'Set Reference': 0
          }
        ]
      } catch ( err ) {
        console.error(err)
      }
    },

    tests: [{
      input: [ 2.0944, 1.2 ],
      expected: [
        {
          pgn: 129291,
          dst: 255,
          prio: 2,
          fields: {
            'Drift': 1.2,
            'Set': 2.0944,
            'Set Reference': "True"
          }
        }
      ]
    },{
      input: [ 1.0944, 1.5 ],
      expected: [
        {
          pgn: 129291,
          dst: 255,
          prio: 2,
          fields: {
            'Drift': 1.5,
            'Set': 1.0944,
            'Set Reference': "True"
          }
        }
      ]
    }]
  }
}

