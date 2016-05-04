'use strict'
var eatHTMLComment = require('../eat/html-comment')
var eatHTMLCDATA = require('../eat/html-cdata')
var eatHTMLProcessingInstruction = require('../eat/html-processing-instructions')
var eatHTMLDeclaration = require('../eat/html-declaration')
var eatHTMLClosingTag = require('../eat/html-closing-tag')
var eatHTMLOpeningTag = require('../eat/html-opening-tag')
var nodeTypes = require('../node-types')

var EXPRESSION_HTML_LINK_OPEN = /^<a /i
var EXPRESSION_HTML_LINK_CLOSE = /^<\/a>/i

/**
 * Find a possible tag.
 *
 * @example
 *   locateTag('foo <bar') // 4
 *
 * @param {string} value - Value to search.
 * @param {number} fromIndex - Index to start searching at.
 * @return {number} - Location of possible tag.
 */
function locateTag (parser, value, fromIndex) {
  return value.indexOf('<', fromIndex)
}

/**
 * Tokenise an HTML tag.
 *
 * @example
 *   tokenizeTag(eat, '<span foo="bar">')
 *
 * @property {Function} locator - Tag locator.
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `html` node.
 */
function tokenizeTag (parser, value, silent) {
  var subvalue = eatHTMLComment(value, parser.options) ||
    eatHTMLCDATA(value) ||
    eatHTMLProcessingInstruction(value) ||
    eatHTMLDeclaration(value) ||
    eatHTMLClosingTag(value) ||
    eatHTMLOpeningTag(value)

  if (!subvalue) {
    return
  }

  /* istanbul ignore if - never used (yet) */
  if (silent) {
    return true
  }

  if (!parser.state.inLink && EXPRESSION_HTML_LINK_OPEN.test(subvalue)) {
    parser.state.inLink = true
  } else if (parser.state.inLink && EXPRESSION_HTML_LINK_CLOSE.test(subvalue)) {
    parser.state.inLink = false
  }

  return parser.eat(subvalue)({
    type: nodeTypes.HTML,
    value: subvalue,
  })
}

tokenizeTag.locator = locateTag

module.exports = tokenizeTag
