'use strict'

var COMMENT_START = '<!--'
var COMMENT_START_LENGTH = COMMENT_START.length
var COMMENT_END = '-->'
var COMMENT_END_CHAR = COMMENT_END.charAt(0)
var COMMENT_END_LENGTH = COMMENT_END.length

/**
 * Try to match comment.
 *
 * @param {string} value - Value to parse.
 * @param {Object} settings - Configuration as available on
 *   a parser.
 * @return {string?} - When applicable, the comment at the
 *   start of `value`.
 */
function eatHTMLComment (value, settings) {
  var index = COMMENT_START_LENGTH
  var queue = COMMENT_START
  var length = value.length
  var commonmark = settings.commonmark
  var character
  var hasNonDash

  if (value.slice(0, index) === queue) {
      while (index < length) {
          character = value.charAt(index)

          if (
                character === COMMENT_END_CHAR &&
                value.slice(index, index + COMMENT_END_LENGTH) === COMMENT_END
            ) {
              return queue + COMMENT_END
            }

          if (commonmark) {
              if (character === '>' && !hasNonDash) {
                  return
                }

              if (character === '-') {
                  if (value.charAt(index + 1) === '-') {
                      return
                    }
                } else {
                  hasNonDash = true
                }
            }

          queue += character
          index++
        }
    }
}

module.exports = eatHTMLComment
