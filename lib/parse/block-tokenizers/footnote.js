'use strict'

module.exports = tokenizeFootnoteDefinition

var isWhiteSpace = require('../is-white-space')
var normalize = require('../../utilities').normalizeIdentifier

var EXPRESSION_INITIAL_TAB = /^( {4}|\t)?/gm

/**
 * Tokenise a footnote definition.
 *
 * @example
 *   tokenizeFootnoteDefinition(eat, '[^foo]: Bar.')
 *
 * @property {boolean} onlyAtTop
 * @property {boolean} notInBlockquote
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `footnoteDefinition` node.
 */
function tokenizeFootnoteDefinition (parser, value, silent) {
  var index
  var length
  var subvalue
  var now
  var indent
  var content
  var queue
  var subqueue
  var character
  var identifier

  if (!parser.options.footnotes) {
    return
  }

  index = 0
  length = value.length
  subvalue = ''
  now = parser.eat.now()
  indent = parser.indent(now.line)

  while (index < length) {
    character = value.charAt(index)

    if (!isWhiteSpace(character)) {
      break
    }

    subvalue += character
    index++
  }

  if (
    value.charAt(index) !== '[' ||
    value.charAt(index + 1) !== '^'
  ) {
    return
  }

  subvalue += '[^'
  index = subvalue.length
  queue = ''

  while (index < length) {
    character = value.charAt(index)

    if (character === ']') {
      break
    } else if (character === '\\') {
      queue += character
      index++
      character = value.charAt(index)
    }

    queue += character
    index++
  }

  if (
    !queue ||
    value.charAt(index) !== ']' ||
    value.charAt(index + 1) !== ':'
  ) {
    return
  }

  if (silent) {
    return true
  }

  identifier = normalize(queue)
  subvalue += queue + ']:'
  index = subvalue.length

  while (index < length) {
    character = value.charAt(index)

    if (
      character !== '\t' &&
      character !== ' '
    ) {
      break
    }

    subvalue += character
    index++
  }

  now.column += subvalue.length
  now.offset += subvalue.length
  queue = content = subqueue = ''

  while (index < length) {
    character = value.charAt(index)

    if (character === '\n') {
      subqueue = character
      index++

      while (index < length) {
        character = value.charAt(index)

        if (character !== '\n') {
          break
        }

        subqueue += character
        index++
      }

      queue += subqueue
      subqueue = ''

      while (index < length) {
        character = value.charAt(index)

        if (character !== ' ') {
          break
        }

        subqueue += character
        index++
      }

      if (!subqueue.length) {
        break
      }

      queue += subqueue
    }

    if (queue) {
      content += queue
      queue = ''
    }

    content += character
    index++
  }

  subvalue += content

  content = content.replace(EXPRESSION_INITIAL_TAB, function (line) {
    indent(line.length)

    return ''
  })

  return parser.eat(subvalue)(
    parser.renderFootnoteDefinition(identifier, content, now)
  )
}

tokenizeFootnoteDefinition.onlyAtTop = true
tokenizeFootnoteDefinition.notInBlockquote = true
