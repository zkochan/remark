'use strict'
module.exports = eatHTMLClosingTag

var isAlphabetic = require('../is-alphabetic')
var isNumeric = require('../is-numeric')
var isWhiteSpace = require('../is-white-space')
var blockElements = require('../block-elements.json')

/**
 * Try to match a closing tag.
 *
 * @param {string} value - Value to parse.
 * @param {boolean?} [isBlock] - Whether the tag-name
 *   must be a known block-level node to match.
 * @return {string?} - When applicable, the closing tag at
 *   the start of `value`.
 */
function eatHTMLClosingTag (value, isBlock) {
  var index = 0
  var length = value.length
  var queue = ''
  var subqueue = ''
  var character

  if (
    value.charAt(index) === '<' &&
    value.charAt(++index) === '/'
  ) {
    queue = '<' + '/'
    subqueue = character = value.charAt(++index)

    if (!isAlphabetic(character)) {
      return
    }

    index++

      /*
       * Eat as many alphabetic characters as
       * possible.
       */

    while (index < length) {
      character = value.charAt(index)

      if (!isAlphabetic(character) && !isNumeric(character)) {
        break
      }

      subqueue += character
      index++
    }

    if (isBlock && blockElements.indexOf(subqueue.toLowerCase()) === -1) {
      return
    }

    queue += subqueue

      /*
       * Eat white-space.
       */

    while (index < length) {
      character = value.charAt(index)

      if (!isWhiteSpace(character)) {
        break
      }

      queue += character
      index++
    }

    if (value.charAt(index) === '>') {
      return queue + '>'
    }
  }
}
