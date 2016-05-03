'use strict'

module.exports = tokenizeHeading

var MAX_ATX_COUNT = 6

/**
 * Tokenise an ATX-style heading.
 *
 * @example
 *   tokenizeHeading(eat, ' # foo')
 *
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `heading` node.
 */
function tokenizeHeading (eat, value, silent) {
  var self = this
  var settings = self.options
  var length = value.length + 1
  var index = -1
  var now = eat.now()
  var subvalue = ''
  var content = ''
  var character
  var queue
  var depth

    /*
     * Eat initial spacing.
     */

  while (++index < length) {
      character = value.charAt(index)

      if (character !== ' ' && character !== '\t') {
          index--
          break
        }

      subvalue += character
    }

    /*
     * Eat hashes.
     */

  depth = 0
  length = index + MAX_ATX_COUNT + 1

  while (++index <= length) {
      character = value.charAt(index)

      if (character !== '#') {
          index--
          break
        }

      subvalue += character
      depth++
    }

  if (
        !depth ||
        (!settings.pedantic && value.charAt(index + 1) === '#')
    ) {
      return
    }

  length = value.length + 1

    /*
     * Eat intermediate white-space.
     */

  queue = ''

  while (++index < length) {
      character = value.charAt(index)

      if (character !== ' ' && character !== '\t') {
          index--
          break
        }

      queue += character
    }

    /*
     * Exit when not in pedantic mode without spacing.
     */

  if (
        !settings.pedantic &&
        !queue.length &&
        character &&
        character !== '\n'
    ) {
      return
    }

  if (silent) {
      return true
    }

    /*
     * Eat content.
     */

  subvalue += queue
  queue = content = ''

  while (++index < length) {
      character = value.charAt(index)

      if (!character || character === '\n') {
          break
        }

      if (
            character !== ' ' &&
            character !== '\t' &&
            character !== '#'
        ) {
          content += queue + character
          queue = ''
          continue
        }

      while (character === ' ' || character === '\t') {
          queue += character
          character = value.charAt(++index)
        }

      while (character === '#') {
          queue += character
          character = value.charAt(++index)
        }

      while (character === ' ' || character === '\t') {
          queue += character
          character = value.charAt(++index)
        }

      index--
    }

  now.column += subvalue.length
  now.offset += subvalue.length
  subvalue += content + queue

  return eat(subvalue)(self.renderHeading(content, depth, now))
}
