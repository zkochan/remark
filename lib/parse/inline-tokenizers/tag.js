'use strict';
var eatHTMLComment = require('../eat/html-comment')
var eatHTMLCDATA = require('../eat/html-cdata')
var eatHTMLProcessingInstruction = require('../eat/html-processing-instructions')
var eatHTMLDeclaration = require('../eat/html-declaration')
var eatHTMLClosingTag = require('../eat/html-closing-tag')
var eatHTMLOpeningTag = require('../eat/html-opening-tag')
const nodeTypes = require('../node-types')

var EXPRESSION_HTML_LINK_OPEN = /^<a /i;
var EXPRESSION_HTML_LINK_CLOSE = /^<\/a>/i;

/**
 * Find a possible tag.
 *
 * @example
 *   locateTag('foo <bar'); // 4
 *
 * @param {string} value - Value to search.
 * @param {number} fromIndex - Index to start searching at.
 * @return {number} - Location of possible tag.
 */
function locateTag(value, fromIndex) {
    return value.indexOf('<', fromIndex);
}

/**
 * Tokenise an HTML tag.
 *
 * @example
 *   tokenizeTag(eat, '<span foo="bar">');
 *
 * @property {Function} locator - Tag locator.
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `html` node.
 */
function tokenizeTag(eat, value, silent) {
    var self = this;
    var subvalue = eatHTMLComment(value, self.options) ||
        eatHTMLCDATA(value) ||
        eatHTMLProcessingInstruction(value) ||
        eatHTMLDeclaration(value) ||
        eatHTMLClosingTag(value) ||
        eatHTMLOpeningTag(value);

    if (!subvalue) {
        return;
    }

    /* istanbul ignore if - never used (yet) */
    if (silent) {
        return true;
    }

    if (!self.inLink && EXPRESSION_HTML_LINK_OPEN.test(subvalue)) {
        self.inLink = true;
    } else if (self.inLink && EXPRESSION_HTML_LINK_CLOSE.test(subvalue)) {
        self.inLink = false;
    }

    return eat(subvalue)({
      type: nodeTypes.HTML,
      value: subvalue,
    });
}

tokenizeTag.locator = locateTag;

module.exports = tokenizeTag;
