'use strict'

const nodeTypes = require('../node-types')

/**
 * Tokenise an escape sequence.
 *
 * @example
 *   tokenizeEscape(eat, '\\a');
 *``
 * @property {Function} locator - Escape locator.
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `text` or `break` node.
 */
function tokenizeEscape(eat, value, silent) {
    var self = this;
    var character;

    if (value.charAt(0) === '\\') {
        character = value.charAt(1);

        if (self.escape.indexOf(character) !== -1) {
            /* istanbul ignore if - never used (yet) */
            if (silent) {
                return true;
            }

            return eat('\\' + character)(
                character === '\n' ?
                    self.renderVoid(nodeTypes.BREAK) :
                    self.renderRaw(nodeTypes.TEXT, character)
            );
        }
    }
}

tokenizeEscape.locator = locateEscape;

/**
 * Find a possible escape sequence.
 *
 * @example
 *   locateEscape('foo \- bar'); // 4
 *
 * @param {string} value - Value to search.
 * @param {number} fromIndex - Index to start searching at.
 * @return {number} - Location of possible escape sequence.
 */
function locateEscape(value, fromIndex) {
    return value.indexOf('\\', fromIndex);
}

module.exports = tokenizeEscape
