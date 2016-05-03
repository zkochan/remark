'use strict'
var CDATA_START = '<![CDATA['
var CDATA_START_LENGTH = CDATA_START.length
var CDATA_END = ']]>'
var CDATA_END_CHAR = CDATA_END.charAt(0)
var CDATA_END_LENGTH = CDATA_END.length

module.exports = eatHTMLCDATA

/**
 * Try to match CDATA.
 *
 * @param {string} value - Value to parse.
 * @return {string?} - When applicable, the CDATA at the
 *   start of `value`.
 */
function eatHTMLCDATA (value) {
  var index = CDATA_START_LENGTH
  var queue = value.slice(0, index)
  var length = value.length
  var character

  if (queue.toUpperCase() === CDATA_START) {
      while (index < length) {
          character = value.charAt(index)

          if (
                character === CDATA_END_CHAR &&
                value.slice(index, index + CDATA_END_LENGTH) === CDATA_END
            ) {
              return queue + CDATA_END
            }

          queue += character
          index++
        }
    }
}
