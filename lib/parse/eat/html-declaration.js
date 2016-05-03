'use strict'
module.exports = eatHTMLDeclaration

var isWhiteSpace = require('../is-white-space')
var isAlphabetic = require('../is-alphabetic')

/**
 * Try to match a declaration.
 *
 * @param {string} value - Value to parse.
 * @return {string?} - When applicable, the declaration at
 *   the start of `value`.
 */
function eatHTMLDeclaration (value) {
  var index = 0
  var length = value.length
  var queue = ''
  var subqueue = ''
  var character

  if (
        value.charAt(index) === '<' &&
        value.charAt(++index) === '!'
    ) {
      queue = '<' + '!'
      index++

        /*
         * Eat as many alphabetic characters as
         * possible.
         */

      while (index < length) {
          character = value.charAt(index)

          if (!isAlphabetic(character)) {
              break
            }

          subqueue += character
          index++
        }

      character = value.charAt(index)

      if (!subqueue || !isWhiteSpace(character)) {
          return
        }

      queue += subqueue + character
      index++

      while (index < length) {
          character = value.charAt(index)

          if (character === '>') {
              return queue
            }

          queue += character
          index++
        }
    }
}
