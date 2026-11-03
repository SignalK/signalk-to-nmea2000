/// <reference types="mocha" />

// The assertion chai-json-equal adds.
declare namespace Chai {
  interface Assertion {
    jsonEqual(expected: unknown): Assertion
  }
}
