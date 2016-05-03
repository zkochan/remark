'use strict'
module.exports = tokenizeBlockquote

const trim = require('trim')
const runAsync = require('run-async')

/**
 * Tokenise a blockquote.
 *
 * @example
 *   tokenizeBlockquote(eat, '> Foo')
 *
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `blockquote` node.
 */
function tokenizeBlockquote (parser, value, silent) {
  var commonmark = parser.options.commonmark
  var now = parser.eat.now()
  var indent = parser.indent(now.line)
  var length = value.length
  var values = []
  var contents = []
  var indents = []
  var add
  var tokenizers
  var index = 0
  var character
  var rest
  var nextIndex
  var content
  var line
  var startIndex
  var prefixed

  while (index < length) {
    character = value.charAt(index)

    if (character !== ' ' && character !== '\t') {
      break
    }

    index++
  }

  if (value.charAt(index) !== '>') {
    return
  }

  if (silent) {
    return true
  }

  tokenizers = parser.blockTokenizers
  index = 0

  return tokenizeEach(index)
    .then(() => {
      index = -1
      length = indents.length
      add = parser.eat(values.join('\n'))

      while (++index < length) {
        indent(indents[index])
      }

      return add(parser.renderBlockquote(contents.join('\n'), now))
    })

  function tokenizeEach (index) {
    if (index >= length) return Promise.resolve()

    nextIndex = value.indexOf('\n', index)
    startIndex = index
    prefixed = false

    if (nextIndex === -1) {
      nextIndex = length
    }

    while (index < length) {
      character = value.charAt(index)

      if (character !== ' ' && character !== '\t') {
        break
      }

      index++
    }

    if (value.charAt(index) === '>') {
      index++
      prefixed = true

      if (value.charAt(index) === ' ') {
        index++
      }
    } else {
      index = startIndex
    }

    content = value.slice(index, nextIndex)

    if (!prefixed && !trim(content)) {
      index = startIndex
      return Promise.resolve()
    }

    if (!prefixed) {
      rest = value.slice(index)

      if (commonmark) {
        return runAsync(tokenizers.code)(parser, rest, true)
          .then(found => {
            if (found) return index

            return runAsync(tokenizers.fences)(parser, rest, true)
              .then(found => {
                if (found) return index

                return runAsync(tokenizers.heading)(parser, rest, true)
                  .then(found => {
                    if (found) return index

                    return runAsync(tokenizers.lineHeading)(parser, rest, true)
                      .then(found => {
                        if (found) return index

                        return runAsync(tokenizers.thematicBreak)(parser, rest, true)
                          .then(found => {
                            if (found) return index

                            return runAsync(tokenizers.html)(parser, rest, true)
                              .then(found => {
                                if (found) return index

                                return runAsync(tokenizers.list)(parser, rest, true)
                                  .then(found => {
                                    if (found) return index

                                    return nextNotCommonmark()
                                  })
                              })
                          })
                      })
                  })
              })
          })
      }

      return nextNotCommonmark()
    }

    return next()

    function next () {
      line = startIndex === index
        ? content
        : value.slice(startIndex, nextIndex)

      indents.push(index - startIndex)
      values.push(line)
      contents.push(content)

      index = nextIndex + 1
      return tokenizeEach(index)
    }

    function nextNotCommonmark () {
      if (!commonmark) {
        return runAsync(tokenizers.definition)(parser, rest, true)
          .then(found => {
            if (found) return index

            return runAsync(tokenizers.footnoteDefinition)(parser, rest, true)
              .then(found => {
                if (found) return index

                return next()
              })
          })
      }

      return next()
    }
  }
}
