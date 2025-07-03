import { ServerAPI, Plugin} from '@signalk/server-api'
import { PGN_128267, PGN_128267Defaults } from '@canboat/ts-pgns'
import _ from 'lodash'

module.exports = (app:ServerAPI, plugin:Plugin) => {
  return {
    title: 'Depth (128267)',
    optionKey: 'DEPTHv2',
    keys: ["environment.depth.belowTransducer"],
    callback: (belowTransducer:number): PGN_128267[]|undefined => {
      var surfaceToTransducer = app.getSelfPath('environment.depth.surfaceToTransducer.value')
      var transducerToKeel = app.getSelfPath('environment.depth.transducerToKeel.value')
      var offset = _.isUndefined(surfaceToTransducer) ? (_.isUndefined(transducerToKeel) ? 0 : transducerToKeel) : surfaceToTransducer
      try {
        return [
          {
            ...PGN_128267Defaults,
            fields: {
              sid: 0xff,
              depth: belowTransducer,
              offset: offset
            }
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

