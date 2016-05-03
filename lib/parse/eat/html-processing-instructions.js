'use strict'

module.exports = eatHTMLProcessingInstruction

/**
 * Try to match a processing instruction.
 *
 * @param {string} value - Value to parse.
 * @return {string?} - When applicable, the processing
 *   instruction at the start of `value`.
 */
function eatHTMLProcessingInstruction (value) {
  var index = 0
  var queue = ''
  var length = value.length
  var character

  if (
      value.charAt(index) === '<' &&
      value.charAt(++index) === '?'
  ) {
    queue = '<?'
    index++

    while (index < length) {
      character = value.charAt(index)

      if (
        character === '?' &&
        value.charAt(index + 1) === '>'
      ) {
        return queue + character + '>'
      }

      queue += character
      index++
    }
  }
}
