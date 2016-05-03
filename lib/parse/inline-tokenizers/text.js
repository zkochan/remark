'use strict'

module.exports = tokenizeText

var ERR_MISSING_LOCATOR = 'Missing locator: '
var nodeTypes = require('../node-types')

/**
 * Tokenise a text node.
 *
 * @example
 *   tokenizeText(eat, 'foo');
 *
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `text` node.
 */
function tokenizeText (parser, value, silent) {
  /* istanbul ignore if - never used (yet) */
  if (silent) {
    return true
  }

  const methods = parser.inlineMethods
  const length = methods.length
  const tokenizers = parser.inlineTokenizers
  let index = -1
  let min = value.length

  while (++index < length) {
    const name = methods[index]

    if (name === 'inlineText' || !tokenizers[name]) {
      continue
    }

    const tokenizer = tokenizers[name].locator

    if (!tokenizer) {
      parser.eat.file.fail(ERR_MISSING_LOCATOR + '`' + name + '`')
      continue
    }

    const position = tokenizer.call(parser, value, 1)

    if (position !== -1 && position < min) {
      min = position
    }
  }

  const subvalue = value.slice(0, min)
  const now = parser.eat.now()

  parser.decode(subvalue, now, (content, position, source) => {
    parser.eat(source || content)({
      type: nodeTypes.TEXT,
      value: content,
    })
  })
}
