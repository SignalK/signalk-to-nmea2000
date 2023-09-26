const { pgnToActisenseSerialFormat, FromPgn } = require("@canboat/canboatjs");
const path = require('path')
const fs = require('fs')
const chai = require('chai')
const assert = chai.assert
chai.Should()
//chai.use(require('chai-things'))
chai.use(require('chai-json-equal'));

const parser = new FromPgn()

let skData = {}

const app = {
  getSelfPath: (path) => {
    return skData[path]
  }
}

function load_conversions () {
  fpath = path.join(__dirname, '../conversions')
  files = fs.readdirSync(fpath)
  return files.map(fname => {
    pgn = path.basename(fname, '.js')
    return require(path.join(fpath, pgn))(app, {});
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
          subConversions = subConversions(conversion.testOptions || {})
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
      var subConversions = conversion.conversions
      if ( typeof subConversions === 'undefined' ) {
        subConversions = [ conversion ]
      } else if ( typeof subConversions === 'function' ) {
        subConversions = subConversions(conversion.testOptions || {})
      }
      subConversions.forEach(subConv => {
        //subConv.should.have.property('tests')
        if ( subConv.tests ) {
          subConv.tests.forEach((test, idx) => {
            it(`${conversion.title} test # ${idx} works`, function (done) {
              skData = test.skData || {}
              let results = subConv.callback.call(null, ...test.input)
              let error
              results.forEach((res, idx) => {
                try
                {
                  let encoded = pgnToActisenseSerialFormat(res)
                  let pgn = parser.parseString(encoded)
                  delete pgn.description
                  delete pgn.src
                  delete pgn.timestamp
                  delete pgn.input

                  let expected = test.expected[idx]
                  let preprocess = expected["__preprocess__"]
                  if ( preprocess ) {
                    preprocess(pgn)
                    delete expected["__preprocess__"]
                  }
                  //console.log('parsed: ' + JSON.stringify(pgn, null, 2))
                  pgn.should.jsonEqual(expected)
                } catch ( e ) {
                  error = e
                }
              })
              done(error)
            })
          })
        }
      })
    })
  })
})

