'use strict'

module.exports = tokenizeParagraph

var trim = require('trim')
var trimTrailingLines = require('trim-trailing-lines')
var nodeTypes = require('../node-types')
const tryBlockTokenize = require('../try-block-tokenize')

var TAB_SIZE = require('../shared-constants').TAB_SIZE

/**
 * Tokenise a paragraph node.
 *
 * @example
 *   tokenizeParagraph(eat, 'Foo.')
 *
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `paragraph` node.
 */
function tokenizeParagraph (parser, value, silent) {
  var settings = parser.options
  var commonmark = settings.commonmark
  var gfm = settings.gfm
  var index = value.indexOf('\n')
  var length = value.length
  var position
  var subvalue
  var character
  var size
  var now

  return tokenizeEach(index)
    .then(index => {
      subvalue = value.slice(0, index)

      if (trim(subvalue) === '') {
        parser.eat(subvalue)

        return null
      }

      /* istanbul ignore if - never used (yet) */
      if (silent) {
        return true
      }

      now = parser.eat.now()
      subvalue = trimTrailingLines(subvalue)

      return parser.eat(subvalue)(parser.renderInline(nodeTypes.PARAGRAPH, subvalue, now))
    })

  function tokenizeEach (index) {
    /*
     * Eat everything if there’s no following newline.
     */

    if (index === -1) return Promise.resolve(length)

    /*
     * Stop if the next character is NEWLINE.
     */

    if (value.charAt(index + 1) === '\n') {
      return Promise.resolve(index)
    }

    /*
     * In commonmark-mode, following indented lines
     * are part of the paragraph.
     */

    if (commonmark) {
      size = 0
      position = index + 1

      while (position < length) {
        character = value.charAt(position)

        if (character === '\t') {
          size = TAB_SIZE
          break
        } else if (character === ' ') {
          size++
        } else {
          break
        }

        position++
      }

      if (size >= TAB_SIZE) {
        index = value.indexOf('\n', index + 1)
        return tokenizeEach(index)
      }
    }

    /*
     * Check if the following code contains a possible
     * block.
     */

    subvalue = value.slice(index + 1)

    return tryBlockTokenize(parser, 'thematicBreak', subvalue, true)
      .then(found => {
        if (found) return index

        return tryBlockTokenize(parser, 'heading', subvalue, true)
          .then(found => {
            if (found) return index

            return tryBlockTokenize(parser, 'fences', subvalue, true)
              .then(found => {
                if (found) return index

                return tryBlockTokenize(parser, 'blockquote', subvalue, true)
                  .then(found => {
                    if (found) return index

                    return tryBlockTokenize(parser, 'html', subvalue, true)
                      .then(found => {
                        if (found) return index

                        if (gfm) {
                          return tryBlockTokenize(parser, 'list', subvalue, true)
                            .then(found => {
                              if (found) return index

                              return lastCheck()
                            })
                        }

                        return lastCheck()
                      })
                  })
              })
          })
      })

    function lastCheck () {
      if (!commonmark) {
        return tryBlockTokenize(parser, 'lineHeading', subvalue, true)
          .then(found => {
            if (found) return index

            return tryBlockTokenize(parser, 'definition', subvalue, true)
              .then(found => {
                if (found) return index

                return tryBlockTokenize(parser, 'footnoteDefinition', subvalue, true)
                  .then(found => {
                    if (found) return index

                    return defaultEnd()
                  })
              })
          })
      }

      return defaultEnd()
    }

    function defaultEnd () {
      index = value.indexOf('\n', index + 1)
      return tokenizeEach(index)
    }
  }
}
