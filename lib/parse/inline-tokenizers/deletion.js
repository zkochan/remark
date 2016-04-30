'use strict'

module.exports = tokenizeDeletion

var isWhiteSpace = require('../is-white-space')
var nodeTypes = require('../node-types')

/**
 * Find a possible deletion.
 *
 * @example
 *   locateDeletion('foo ~~bar') // 4
 *
 * @param {string} value - Value to search.
 * @param {number} fromIndex - Index to start searching at.
 * @return {number} - Location of possible deletion.
 */
function locateDeletion (value, fromIndex) {
  return value.indexOf('~' + '~', fromIndex)
}

/**
 * Tokenise a deletion.
 *
 * @example
 *   tokenizeDeletion(eat, '~~foo~~')
 *
 * @property {Function} locator - Deletion locator.
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `delete` node.
 */
function tokenizeDeletion (eat, value, silent) {
  var self = this
  var character = ''
  var previous = ''
  var preceding = ''
  var subvalue = ''
  var index
  var length
  var now

  if (
    !self.options.gfm ||
    value.charAt(0) !== '~' ||
    value.charAt(1) !== '~' ||
    isWhiteSpace(value.charAt(2))
  ) {
    return
  }

  index = 1
  length = value.length
  now = eat.now()
  now.column += 2
  now.offset += 2

  while (++index < length) {
    character = value.charAt(index)

    if (
      character === '~' &&
      previous === '~' &&
      (!preceding || !isWhiteSpace(preceding))
    ) {
      /* istanbul ignore if - never used (yet) */
      if (silent) {
        return true
      }

      return eat('~' + '~' + subvalue + '~' + '~')(
        self.renderInline(nodeTypes.DELETE, subvalue, now)
      )
    }

    subvalue += previous
    preceding = previous
    previous = character
  }
}

tokenizeDeletion.locator = locateDeletion
