module.exports = {
  require: ['ts-node/register'],
  extensions: ['ts', 'js'],
  spec: ['test/*.ts', 'test/*.js'],
  ignore: ['test/*.d.ts'],
  timeout: 10000,
  exit: true
}
