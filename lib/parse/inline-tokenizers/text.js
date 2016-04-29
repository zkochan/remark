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
function tokenizeText (eat, value, silent) {
  var self = this

  /* istanbul ignore if - never used (yet) */
  if (silent) {
    return true
  }

  const methods = self.inlineMethods
  const length = methods.length
  const tokenizers = self.inlineTokenizers
  let index = -1
  let min = value.length

  while (++index < length) {
    const name = methods[index]

    if (name === 'inlineText' || !tokenizers[name]) {
      continue
    }

    const tokenizer = tokenizers[name].locator

    if (!tokenizer) {
      eat.file.fail(ERR_MISSING_LOCATOR + '`' + name + '`')
      continue
    }

    const position = tokenizer.call(self, value, 1)

    if (position !== -1 && position < min) {
      min = position
    }
  }

  const subvalue = value.slice(0, min)
  const now = eat.now()

  self.decode(subvalue, now, function (content, position, source) {
    eat(source || content)({
      type: nodeTypes.TEXT,
      value: content,
    })
  })
}
