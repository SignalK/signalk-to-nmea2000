const _ = require('lodash')

module.exports = (app, plugin) => {
  return {
    title: 'Depth (128267)',
    optionKey: 'DEPTHv2',
    keys: ["environment.depth.belowTransducer"],
    callback: (belowTransducer) => {
      var surfaceToTransducer = app.getSelfPath('environment.depth.surfaceToTransducer.value')
      var transducerToKeel = app.getSelfPath('environment.depth.transducerToKeel.value')
      var offset = _.isUndefined(surfaceToTransducer) ? (_.isUndefined(transducerToKeel) ? 0 : transducerToKeel) : surfaceToTransducer
      try {
        return [
          {
            pgn: 128267,
            SID: 0xff,
            Depth: belowTransducer,
            Offset: offset
          }
        ]
      } catch ( err ) {
        console.error(err)
      }
    },
    tests: [{
      input: [ 4.5 ],
      skSelfData: {
        'environment.depth.surfaceToTransducer.value': 1
      },
      expected: [{
        "prio": 2,
        "pgn": 128267,
        "dst": 255,
        "fields": {
          "Depth": 4.5,
          "Offset": 1
        }
      }]
    },{
      input: [ 2.1 ],
      skSelfData: {
        'environment.depth.transducerToKeel.value': 3
      },
      expected: [{
        "prio": 2,
        "pgn": 128267,
        "dst": 255,
        "fields": {
          "Depth": 2.1,
          "Offset": 3
        }
      }]
    }]
  }
}

