'use strict'

module.exports = tokenizeParagraph

var trim = require('trim');
var trimTrailingLines = require('trim-trailing-lines');
var nodeTypes = require('../node-types')

var TAB_SIZE = require('../shared-constants').TAB_SIZE

/**
 * Tokenise a paragraph node.
 *
 * @example
 *   tokenizeParagraph(eat, 'Foo.');
 *
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `paragraph` node.
 */
function tokenizeParagraph(eat, value, silent) {
    var self = this;
    var settings = self.options;
    var commonmark = settings.commonmark;
    var gfm = settings.gfm;
    var tokenizers = self.blockTokenizers;
    var index = value.indexOf('\n');
    var length = value.length;
    var position;
    var subvalue;
    var character;
    var size;
    var now;

    while (index < length) {
        /*
         * Eat everything if there’s no following newline.
         */

        if (index === -1) {
            index = length;
            break;
        }

        /*
         * Stop if the next character is NEWLINE.
         */

        if (value.charAt(index + 1) === '\n') {
            break;
        }

        /*
         * In commonmark-mode, following indented lines
         * are part of the paragraph.
         */

        if (commonmark) {
            size = 0;
            position = index + 1;

            while (position < length) {
                character = value.charAt(position);

                if (character === '\t') {
                    size = TAB_SIZE;
                    break;
                } else if (character === ' ') {
                    size++;
                } else {
                    break;
                }

                position++;
            }

            if (size >= TAB_SIZE) {
                index = value.indexOf('\n', index + 1);
                continue;
            }
        }

        /*
         * Check if the following code contains a possible
         * block.
         */

        subvalue = value.slice(index + 1);

        if (
            tokenizers.thematicBreak.call(self, eat, subvalue, true) ||
            tokenizers.heading.call(self, eat, subvalue, true) ||
            tokenizers.fences.call(self, eat, subvalue, true) ||
            tokenizers.blockquote.call(self, eat, subvalue, true) ||
            tokenizers.html.call(self, eat, subvalue, true)
        ) {
            break;
        }

        if (gfm && tokenizers.list.call(self, eat, subvalue, true)) {
            break;
        }

        if (
            !commonmark &&
            (
                tokenizers.lineHeading.call(self, eat, subvalue, true) ||
                tokenizers.definition.call(self, eat, subvalue, true) ||
                tokenizers.footnoteDefinition.call(self, eat, subvalue, true)
            )
        ) {
            break;
        }

        index = value.indexOf('\n', index + 1);
    }

    subvalue = value.slice(0, index);

    if (trim(subvalue) === '') {
        eat(subvalue);

        return null;
    }

    /* istanbul ignore if - never used (yet) */
    if (silent) {
        return true;
    }

    now = eat.now();
    subvalue = trimTrailingLines(subvalue);

    return eat(subvalue)(self.renderInline(nodeTypes.PARAGRAPH, subvalue, now));
}
