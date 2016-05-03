'use strict'

module.exports = tokenizeThematicBreak

var RULE_MARKERS = require('../shared-constants').RULE_MARKERS
var nodeTypes = require('../node-types')
var THEMATIC_BREAK_MARKER_COUNT = 3

/**
 * Tokenise a horizontal rule.
 *
 * @example
 *   tokenizeThematicBreak(eat, '***');
 *
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `thematicBreak` node.
 */
function tokenizeThematicBreak (eat, value, silent) {
  var self = this
  var index = -1
  var length = value.length + 1
  var subvalue = ''
  var character
  var marker
  var markerCount
  var queue

  while (++index < length) {
    character = value.charAt(index)

    if (character !== '\t' && character !== ' ') {
      break
    }

    subvalue += character
  }

  if (RULE_MARKERS[character] !== true) {
    return
  }

  marker = character
  subvalue += character
  markerCount = 1
  queue = ''

  while (++index < length) {
    character = value.charAt(index)

    if (character === marker) {
      markerCount++
      subvalue += queue + marker
      queue = ''
    } else if (character === ' ') {
      queue += character
    } else if (
            markerCount >= THEMATIC_BREAK_MARKER_COUNT &&
            (!character || character === '\n')
        ) {
      subvalue += queue

      if (silent) {
        return true
      }

      return eat(subvalue)({
        type: nodeTypes.THEMATIC_BREAK,
      })
    } else {
      return
    }
  }
}
