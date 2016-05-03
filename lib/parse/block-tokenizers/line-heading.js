'use strict'

module.exports = tokenizeLineHeading

var MAX_LINE_HEADING_INDENT = 3

/*
 * A map of characters which can be used to mark setext
 * headers, mapping to their corresponding depth.
 */

var SETEXT_MARKERS = {}

SETEXT_MARKERS['='] = 1
SETEXT_MARKERS['-'] = 2

/**
 * Tokenise a Setext-style heading.
 *
 * @example
 *   tokenizeLineHeading(eat, 'foo\n===');
 *
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `heading` node.
 */
function tokenizeLineHeading (eat, value, silent) {
  var self = this
  var now = eat.now()
  var length = value.length
  var index = -1
  var subvalue = ''
  var content
  var queue
  var character
  var marker
  var depth

    /*
     * Eat initial indentation.
     */

  while (++index < length) {
    character = value.charAt(index)

    if (character !== ' ' || index >= MAX_LINE_HEADING_INDENT) {
      index--
      break
    }

    subvalue += character
  }

    /*
     * Eat content.
     */

  content = queue = ''

  while (++index < length) {
    character = value.charAt(index)

    if (character === '\n') {
      index--
      break
    }

    if (character === ' ' || character === '\t') {
      queue += character
    } else {
      content += queue + character
      queue = ''
    }
  }

  now.column += subvalue.length
  now.offset += subvalue.length
  subvalue += content + queue

  /*
   * Ensure the content is followed by a newline and a
   * valid marker.
   */

  character = value.charAt(++index)
  marker = value.charAt(++index)

  if (
    character !== '\n' ||
    !SETEXT_MARKERS[marker]
  ) {
    return
  }

  if (silent) {
    return true
  }

  subvalue += character

    /*
     * Eat Setext-line.
     */

  queue = marker
  depth = SETEXT_MARKERS[marker]

  while (++index < length) {
    character = value.charAt(index)

    if (character !== marker) {
      if (character !== '\n') {
        return
      }

      index--
      break
    }

    queue += character
  }

  return eat(subvalue + queue)(self.renderHeading(content, depth, now))
}
