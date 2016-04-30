'use strict'

module.exports = tokenizeParagraph

var trim = require('trim')
var trimTrailingLines = require('trim-trailing-lines')
var nodeTypes = require('../node-types')
const runAsync = require('run-async')

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
function tokenizeParagraph (eat, value, silent) {
  var self = this
  var settings = self.options
  var commonmark = settings.commonmark
  var gfm = settings.gfm
  var tokenizers = self.blockTokenizers
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
        eat(subvalue)

        return null
      }

      /* istanbul ignore if - never used (yet) */
      if (silent) {
        return true
      }

      now = eat.now()
      subvalue = trimTrailingLines(subvalue)

      return eat(subvalue)(self.renderInline(nodeTypes.PARAGRAPH, subvalue, now))
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

    return runAsync(tokenizers.thematicBreak.bind(self))(eat, subvalue, true)
      .then(found => {
        if (found) return index

        return runAsync(tokenizers.heading.bind(self))(eat, subvalue, true)
          .then(found => {
            if (found) return index

            return runAsync(tokenizers.fences.bind(self))(eat, subvalue, true)
              .then(found => {
                if (found) return index

                return runAsync(tokenizers.blockquote.bind(self))(eat, subvalue, true)
                  .then(found => {
                    if (found) return index

                    return runAsync(tokenizers.html.bind(self))(eat, subvalue, true)
                      .then(found => {
                        if (found) return index

                        if (gfm) {
                          return runAsync(tokenizers.list.bind(self))(eat, subvalue, true)
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
        return runAsync(tokenizers.lineHeading.bind(self))(eat, subvalue, true)
          .then(found => {
            if (found) return index

            return runAsync(tokenizers.definition.bind(self))(eat, subvalue, true)
              .then(found => {
                if (found) return index

                return runAsync(tokenizers.footnoteDefinition.bind(self))(eat, subvalue, true)
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
