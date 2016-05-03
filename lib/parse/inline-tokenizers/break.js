'use strict'

module.exports = tokenizeBreak

var nodeTypes = require('../node-types')

var MIN_BREAK_LENGTH = 2

/**
 * Find a possible break.
 *
 * @example
 *   locateBreak('foo   \nbar') // 3
 *
 * @param {string} value - Value to search.
 * @param {number} fromIndex - Index to start searching at.
 * @return {number} - Location of possible break.
 */
function locateBreak (value, fromIndex) {
  var index = value.indexOf('\n', fromIndex)

  while (index > fromIndex) {
    if (value.charAt(index - 1) !== ' ') {
      break
    }

    index--
  }

  return index
}

/**
 * Tokenise a break.
 *
 * @example
 *   tokenizeBreak(eat, '  \n')
 *
 * @property {Function} locator - Break locator.
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `break` node.
 */
function tokenizeBreak (eat, value, silent) {
  const self = this
  const breaks = self.options.breaks
  let index = -1
  let queue = ''

  while (++index < value.length) {
    const character = value.charAt(index)

    if (character === '\n') {
      if (!breaks && index < MIN_BREAK_LENGTH) {
        return
      }

      /* istanbul ignore if - never used (yet) */
      if (silent) {
        return true
      }

      queue += character
      return eat(queue)({
        type: nodeTypes.BREAK,
      })
    }

    if (character !== ' ') {
      return
    }

    queue += character
  }
}

tokenizeBreak.locator = locateBreak
