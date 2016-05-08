'use strict'
var repeat = require('repeat-string')
var longestStreak = require('longest-streak')

/**
 * Stringify inline code.
 *
 * Knows about internal ticks (`\``), and ensures one more
 * tick is used to enclose the inline code:
 *
 *     ```foo ``bar`` baz```
 *
 * Even knows about inital and final ticks:
 *
 *     `` `foo ``
 *     `` foo` ``
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.inlineCode({
 *     type: 'inlineCode',
 *     value: 'foo(); `bar`; baz()'
 *   });
 *   // '``foo(); `bar`; baz()``'
 *
 * @param {Object} node - `inlineCode` node.
 * @return {string} - Markdown inline code.
 */
module.exports = function (compiler, node) {
  var value = node.value
  var ticks = repeat('`', longestStreak(value, '`') + 1)
  var start = ticks
  var end = ticks

  if (value.charAt(0) === '`') {
    start += ' '
  }

  if (value.charAt(value.length - 1) === '`') {
    end = ' ' + end
  }

  return start + node.value + end
}
