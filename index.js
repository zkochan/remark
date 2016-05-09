'use strict'

/* eslint-env commonjs */

/*
 * Dependencies.
 */

var unified = require('../unified')
var parserFactory = require('./lib/parse')
var Compiler = require('./lib/stringify')
var escape = require('./lib/escape.json')

/*
 * Exports.
 */

module.exports = unified({
  name: 'mdast',
  parserFactory,
  blockTokenizers: require('./lib/parse/block-tokenizers'),
  inlineTokenizers: require('./lib/parse/inline-tokenizers'),
  visitors: require('./lib/stringify/visitors'),
  Compiler,
  data: {
    escape,
  },
})
