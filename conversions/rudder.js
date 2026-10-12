// The rudder angle as reported by a rudder angle sensor. Signal K has no
// path for the angle order, so only the position is sent.
const defaultInstance = 0

module.exports = (app, plugin) => {
  return {
    pgn: 127245,
    title: 'Rudder (127245)',
    optionKey: 'RUDDER',
    keys: [ 'steering.rudderAngle' ],
    properties: {
      instance: {
        title: 'N2K Rudder Instance',
        description: 'Tells apart several rudders; 0 for a single rudder',
        type: 'number',
        default: defaultInstance
      }
    },

    testOptions: [
      { RUDDER: { instance: 1 } },
      { RUDDER: {} }
    ],

    conversions: (options) => {
      let instance = options.RUDDER.instance
      if ( instance === undefined )
        instance = defaultInstance
      return [{
        keys: [ 'steering.rudderAngle' ],
        callback: (angle) => {
          return [{
            pgn: 127245,
            Instance: instance,
            Position: angle
          }]
        },
        tests: [{
          input: [ -0.1745 ],
          expected: [
            (testOptions) => ({
              "prio": 2,
              "pgn": 127245,
              "dst": 255,
              "fields": {
                "Instance": testOptions.RUDDER.instance ?? defaultInstance,
                "Position": -0.1745
              }
            })
          ]
        }]
      }]
    }
  }
}
