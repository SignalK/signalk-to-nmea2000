module.exports = {
  require: ['ts-node/register'],
  extensions: ['ts'],
  spec: ['test/*.ts'],
  ignore: ['test/*.d.ts'],
  timeout: 10000,
  exit: true
}
