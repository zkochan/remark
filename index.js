/**
 * @author Titus Wormer
 * @copyright 2015-2016 Titus Wormer
 * @license MIT
 * @module remark
 * @version 0.1.0
 * @fileoverview Markdown processor powered by plugins.
 */

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
  Compiler,
  data: {
    escape,
  },
})
