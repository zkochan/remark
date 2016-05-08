'use strict'
var repeat = require('repeat-string')
var INDENT = 4

/**
 * Pad `value` with `level * INDENT` spaces.  Respects
 * lines. Ignores '' lines.
 *
 * @example
 *   pad('foo', 1) // '    foo'
 *
 * @param {string} value - Content.
 * @param {number} level - Indentation level.
 * @return {string} - Padded `value`.
 */
module.exports = function pad (value, level) {
  var index
  var padding

  value = value.split('\n')

  index = value.length
  padding = repeat(' ', level * INDENT)

  while (index--) {
    if (value[index].length !== 0) {
      value[index] = padding + value[index]
    }
  }

  return value.join('\n')
}
