'use strict'
const runAsync = require('run-async')

module.exports = (parser, tokenizerName, subvalue, silent) =>
 runAsync(parser.blockTokenizers.find(t => t.name === tokenizerName).func)(parser, subvalue, silent)
