'use strict'

module.exports = tokenizeHTML

var eatHTMLComment = require('../eat/html-comment')
var eatHTMLCDATA = require('../eat/html-cdata')
var eatHTMLProcessingInstruction = require('../eat/html-processing-instructions')
var eatHTMLDeclaration = require('../eat/html-declaration')
var eatHTMLClosingTag = require('../eat/html-closing-tag')
var eatHTMLOpeningTag = require('../eat/html-opening-tag')
var nodeTypes = require('../node-types')

var MIN_CLOSING_HTML_NEWLINE_COUNT = 2

/**
 * Tokenise HTML.
 *
 * @example
 *   tokenizeHTML(eat, '<span>foo</span>');
 *
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `html` node.
 */
function tokenizeHTML (eat, value, silent) {
  var self = this
  var index = 0
  var length = value.length
  var subvalue = ''
  var offset
  var lineCount
  var character
  var queue

    /*
     * Eat initial spacing.
     */

  while (index < length) {
      character = value.charAt(index)

      if (character !== '\t' && character !== ' ') {
          break
        }

      subvalue += character
      index++
    }

  offset = index
  value = value.slice(offset)

    /*
     * Try to eat an HTML thing.
     */

  queue = eatHTMLComment(value, self.options) ||
        eatHTMLCDATA(value) ||
        eatHTMLProcessingInstruction(value) ||
        eatHTMLDeclaration(value) ||
        eatHTMLClosingTag(value, true) ||
        eatHTMLOpeningTag(value, true)

  if (!queue) {
      return
    }

  if (silent) {
      return true
    }

  subvalue += queue
  index = subvalue.length - offset
  queue = ''

  while (index < length) {
      character = value.charAt(index)

      if (character === '\n') {
          queue += character
          lineCount++
        } else if (queue.length < MIN_CLOSING_HTML_NEWLINE_COUNT) {
          subvalue += queue + character
          queue = ''
        } else {
          break
        }

      index++
    }

  return eat(subvalue)({
      type: nodeTypes.HTML,
      value: subvalue,
    })
}
