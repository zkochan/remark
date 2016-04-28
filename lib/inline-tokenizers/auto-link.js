'use strict';
var decode = require('parse-entities');
var MAILTO_PROTOCOL = 'mailto:';

/**
 * Find a possible auto-link.
 *
 * @example
 *   locateAutoLink('foo <bar'); // 4
 *
 * @param {string} value - Value to search.
 * @param {number} fromIndex - Index to start searching at.
 * @return {number} - Location of possible auto-link.
 */
function locateAutoLink(value, fromIndex) {
    return value.indexOf('<', fromIndex);
}

/**
 * Tokenise a URL in carets.
 *
 * @example
 *   tokenizeAutoLink(eat, '<http://foo.bar>');
 *
 * @property {boolean} notInLink
 * @property {Function} locator - Auto-link locator.
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `link` node.
 */
function tokenizeAutoLink(eat, value, silent) {
    var self;
    var subvalue;
    var length;
    var index;
    var queue;
    var character;
    var hasAtCharacter;
    var link;
    var now;
    var content;
    var tokenize;
    var node;

    if (value.charAt(0) !== '<') {
        return;
    }

    self = this;
    subvalue = '';
    length = value.length;
    index = 0;
    queue = '';
    hasAtCharacter = false;
    link = '';

    index++;
    subvalue = '<';

    while (index < length) {
        character = value.charAt(index);

        if (
            character === ' ' ||
            character === '>' ||
            character === '@' ||
            (character === ':' && value.charAt(index + 1) === '/')
        ) {
            break;
        }

        queue += character;
        index++;
    }

    if (!queue) {
        return;
    }

    link += queue;
    queue = '';

    character = value.charAt(index);
    link += character;
    index++;

    if (character === '@') {
        hasAtCharacter = true;
    } else {
        if (
            character !== ':' ||
            value.charAt(index + 1) !== '/'
        ) {
            return;
        }

        link += '/';
        index++;
    }

    while (index < length) {
        character = value.charAt(index);

        if (character === ' ' || character === '>') {
            break;
        }

        queue += character;
        index++;
    }

    character = value.charAt(index);

    if (!queue || character !== '>') {
        return;
    }

    /* istanbul ignore if - never used (yet) */
    if (silent) {
        return true;
    }

    link += queue;
    content = link;
    subvalue += link + character;
    now = eat.now();
    now.column++;
    now.offset++;

    if (hasAtCharacter) {
        if (
            link.substr(0, MAILTO_PROTOCOL.length).toLowerCase() !==
            MAILTO_PROTOCOL
        ) {
            link = MAILTO_PROTOCOL + link;
        } else {
            content = content.substr(MAILTO_PROTOCOL.length);
            now.column += MAILTO_PROTOCOL.length;
            now.offset += MAILTO_PROTOCOL.length;
        }
    }

    /*
     * Temporarily remove support for escapes in autolinks.
     */

    tokenize = self.inlineTokenizers.escape;
    self.inlineTokenizers.escape = null;

    node = eat(subvalue)(
        self.renderLink(true, decode(link), content, null, now, eat)
    );

    self.inlineTokenizers.escape = tokenize;

    return node;
}

tokenizeAutoLink.notInLink = true;
tokenizeAutoLink.locator = locateAutoLink;

module.exports = tokenizeAutoLink
