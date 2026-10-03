const _ = require('lodash')

const loadCellInstances = {
  'Forestay': 0,
  'Backstay': 1,
  'Boomvang': 2,
  'Inner Forestay': 3,
  'Inner Forestay Halyard': 4,
  'Jib Halyard': 5,
  'Outhaul': 6,
  'Code Zero': 7,
  'Bobstay': 8,
  'J1': 9,
  'J2': 10,
  'J3': 11,
  'Mast Base': 12,
  'Mainsheet': 13,
  'D0 Port': 14,
  'D0 Stbd': 15,
  'Runner Port': 16,
  'Runner Stbd': 17,
  'Foil Port': 18,
  'Foil Stbd': 19,
  'Sail Tack Port': 20,
  'Stail Tack Stbd': 21,
  'Deflect Port': 22,
  'Deflect Stbd': 23,
  'Rudder Port': 24,
  'Rudder Stdb': 25,
  'D1 Port': 26,
  'D1 Stbd': 27,
  'V0 Port': 28,
  'V0 Stbd': 29,
  'V1 Port': 30,
  'V1 Stbd': 31,
  'Reacher': 32,
  'Blade': 33,
  'Staysail': 34
}

function loadCellMessage(instanceName, load) {
  if (load == null) {
    return null
  }

  return {
    pgn: 65293,
    "Manufacturer Code": 641,
    "Industry Code": 4,
    "Instance": loadCellInstances[instanceName],
    "Load Cell": Math.abs(load)
  }
}

module.exports = (app, plugin) => {
  return {
    title: 'Diverse Yacht Services Load Cell (65293)',
    optionKey: 'DIVERSE_LOADCELL',
    context: 'vessels.self',
    properties: {
      loadCells: {
        title: 'Load Cell Mapping',
        type: 'array',
        items: {
          type: 'object',
          required: [ 'path', 'instanceName' ],
          properties: {
            path: {
              title: 'Signal K Load Cell Path',
              type: 'string'
            },
            instanceName: {
              title: 'Load Cell Instance',
              type: 'string',
              enum: Object.keys(loadCellInstances)
            }
          }
        }
      }
    },

    testOptions: {
      DIVERSE_LOADCELL: {
        loadCells: [{
          path: 'rigging.loadCells.bobstay.load',
          instanceName: 'Bobstay'
        }]
      }
    },

    conversions: (options) => {
      if (!_.get(options, 'DIVERSE_LOADCELL.loadCells')) {
        return null
      }

      return options.DIVERSE_LOADCELL.loadCells.map(loadCell => {
        return {
          keys: [ loadCell.path ],
          callback: (load) => {
            return [ loadCellMessage(loadCell.instanceName, load) ]
          },
          tests: [{
            input: [ -12345 ],
            expected: [{
              "prio": 2,
              "pgn": 65293,
              "dst": 255,
              "fields": {
                "Manufacturer Code": "Diverse Yacht Services",
                "Industry Code": "Marine Industry",
                "Instance": 8,
                "Load Cell": 12345
              }
            }]
          }]
        }
      })
    }
  }
}
