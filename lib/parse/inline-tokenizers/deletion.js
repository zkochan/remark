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
function locateDeletion (parser, value, fromIndex) {
  return value.indexOf('~~', fromIndex)
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
function tokenizeDeletion (parser, value, silent) {
  var character = ''
  var previous = ''
  var preceding = ''
  var subvalue = ''
  var index
  var length
  var now

  if (
    !parser.options.gfm ||
    value.charAt(0) !== '~' ||
    value.charAt(1) !== '~' ||
    isWhiteSpace(value.charAt(2))
  ) {
    return
  }

  index = 1
  length = value.length
  now = parser.eat.now()
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

      return parser.eat(`~~${subvalue}~~`)(
        parser.renderInline(nodeTypes.DELETE, subvalue, now)
      )
    }

    subvalue += previous
    preceding = previous
    previous = character
  }
}

tokenizeDeletion.locator = locateDeletion
