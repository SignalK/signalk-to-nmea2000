const { pgnToActisenseSerialFormat, FromPgn } = require("@canboat/canboatjs");
const { mapCamelCaseKeys } = require('@canboat/ts-pgns')
const path = require('path')
const fs = require('fs')
const chai = require('chai')
const assert = chai.assert
chai.Should()
//chai.use(require('chai-things'))
chai.use(require('chai-json-equal'));

const parser = new FromPgn({useCamel:false})

let skSelfData = {}
let skData = {}

const app = {
  getSelfPath: (path) => {
    return skSelfData[path]
  },
  getPath: (path) => {
    return skData[path]
  },
  debug: (msg) => {
  }
}

function load_conversions () {
  fpath = path.join(__dirname, '../dist/conversions')
  files = fs.readdirSync(fpath)
  return files.map(fname => {
    if ( fname.endsWith('.js') ) {
      pgn = path.basename(fname, '.js')
      return require(path.join(fpath, pgn))(app, {});
    }
  }).filter(converter => { return typeof converter !== 'undefined'; });
}

const conversions = load_conversions()

describe('every conversion has a test', () => {
  conversions.forEach(conversion => {
    if ( !Array.isArray(conversion) ) {
      conversion = [ conversion ]
    }      
    
    conversion.forEach(conversion => {
      it(`${conversion.title} has a test`, function (done) {
        var subConversions = conversion.conversions
        if ( typeof subConversions === 'undefined' ) {
          subConversions = [ conversion ]
        } else if ( typeof subConversions === 'function' ) {
          subConversions = subConversions(Array.isArray(conversion.testOptions) ? conversion.testOptions[0] : conversion.testOptions)
        }
        assert(subConversions != undefined)
        subConversions.forEach(subConv => {
          subConv.should.have.property('tests')
        })
        done()
      })
    })
  })
})

describe('conversions work', () => {
  conversions.forEach(conversion => {
    if ( !Array.isArray(conversion) ) {
      conversion = [ conversion ]
    }      
    
    conversion.forEach(conversion => {
      let optionsList = Array.isArray(conversion.testOptions) ? conversion.testOptions : [ conversion.testOptions ]

      optionsList.forEach((options, oidx) => {
        var subConversions = conversion.conversions
        if ( typeof subConversions === 'undefined' ) {
          subConversions = [ conversion ]
        } else if ( typeof subConversions === 'function' ) {
          subConversions = subConversions(options || {})
        }
        subConversions.forEach(subConv => {
          //subConv.should.have.property('tests')
          if ( subConv.tests ) {
            subConv.tests.forEach((test, idx) => {
              it(`${conversion.title} test # ${oidx}/${idx} works`, function (done) {
                skData = test.skData || {}
                skSelfData = test.skSelfData || {}
                let result = subConv.callback.call(null, ...test.input)
                Promise.resolve(result).then(results => {
                  results = results || []
                  Promise.all(results).then(pgns => {
                    let error
                    assert.equal(pgns.length, test.expected.length, 'number of results returned does not match the number of expected results')
                    pgns.forEach((res, idx) => {
                      try
                      {
                        let encoded = pgnToActisenseSerialFormat(res)
                        let pgn = parser.parseString(encoded)
                        delete pgn.description
                        delete pgn.src
                        delete pgn.timestamp
                        delete pgn.input
                        delete pgn.id

                        let expected = test.expected[idx]
                        if ( typeof expected === 'function' ) {
                          expected = expected(options)
                        }
                        let preprocess = expected["__preprocess__"]
                        if ( preprocess ) {
                          preprocess(pgn)
                          delete expected["__preprocess__"]
                        }
                        //console.log('parsed: ' + JSON.stringify(pgn, null, 2))
                        pgn.should.jsonEqual(expected)
                      } catch ( e ) {
                        //console.error(e)
                        error = e
                      }
                    })
                    done(error)
                  })
                })
              })
            })
          }
        })
      })
    })
  })
})

