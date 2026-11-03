/// <reference types="mocha" />
// The tests call chai.should(); @types/chai declares Object.should here.
/// <reference types="chai/register-should" />

// The assertion chai-json-equal adds.
declare namespace Chai {
  interface Assertion {
    jsonEqual(expected: unknown): Assertion
  }
}
