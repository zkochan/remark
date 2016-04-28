'use strict'

module.exports = tokenizeInlineCode

var isWhiteSpace = require('../is-white-space')
var nodeTypes = require('../node-types')

/**
 * Find possible inline code.
 *
 * @example
 *   locateInlineCode('foo `bar'); // 4
 *
 * @param {string} value - Value to search.
 * @param {number} fromIndex - Index to start searching at.
 * @return {number} - Location of possible inline code.
 */
function locateInlineCode(value, fromIndex) {
    return value.indexOf('`', fromIndex);
}

/**
 * Tokenise inline code.
 *
 * @example
 *   tokenizeInlineCode(eat, '`foo()`');
 *
 * @property {Function} locator - Inline code locator.
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `inlineCode` node.
 */
function tokenizeInlineCode(eat, value, silent) {
    var self = this;
    var length = value.length;
    var index = 0;
    var queue = '';
    var tickQueue = '';
    var contentQueue;
    var whiteSpaceQueue;
    var count;
    var openingCount;
    var subvalue;
    var character;
    var found;
    var next;

    while (index < length) {
        if (value.charAt(index) !== '`') {
            break;
        }

        queue += '`';
        index++;
    }

    if (!queue) {
        return;
    }

    subvalue = queue;
    openingCount = index;
    queue = '';
    next = value.charAt(index);
    count = 0;

    while (index < length) {
        character = next;
        next = value.charAt(index + 1);

        if (character === '`') {
            count++;
            tickQueue += character;
        } else {
            count = 0;
            queue += character;
        }

        if (count && next !== '`') {
            if (count === openingCount) {
                subvalue += queue + tickQueue;
                found = true;
                break;
            }

            queue += tickQueue;
            tickQueue = '';
        }

        index++;
    }

    if (!found) {
        if (openingCount % 2 !== 0) {
            return;
        }

        queue = '';
    }

    /* istanbul ignore if - never used (yet) */
    if (silent) {
        return true;
    }

    contentQueue = whiteSpaceQueue = '';
    length = queue.length;
    index = -1;

    while (++index < length) {
        character = queue.charAt(index);

        if (isWhiteSpace(character)) {
            whiteSpaceQueue += character;
            continue;
        }

        if (whiteSpaceQueue) {
            if (contentQueue) {
                contentQueue += whiteSpaceQueue;
            }

            whiteSpaceQueue = '';
        }

        contentQueue += character;
    }

    return eat(subvalue)(self.renderRaw(nodeTypes.INLINE_CODE, contentQueue));
}

tokenizeInlineCode.locator = locateInlineCode;
