'use strict'

module.exports = tokenizeText

var ERR_MISSING_LOCATOR = 'Missing locator: ';
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
function tokenizeText(eat, value, silent) {
    var self = this;
    var methods;
    var tokenizers;
    var index;
    var length;
    var subvalue;
    var position;
    var tokenizer;
    var name;
    var min;
    var now;

    /* istanbul ignore if - never used (yet) */
    if (silent) {
        return true;
    }

    methods = self.inlineMethods;
    length = methods.length;
    tokenizers = self.inlineTokenizers;
    index = -1;
    min = value.length;

    while (++index < length) {
        name = methods[index];

        if (name === 'inlineText' || !tokenizers[name]) {
            continue;
        }

        tokenizer = tokenizers[name].locator;

        if (!tokenizer) {
            eat.file.fail(ERR_MISSING_LOCATOR + '`' + name + '`');
            continue;
        }

        position = tokenizer.call(self, value, 1);

        if (position !== -1 && position < min) {
            min = position;
        }
    }

    subvalue = value.slice(0, min);
    now = eat.now();

    self.decode(subvalue, now, function (content, position, source) {
        eat(source || content)(self.renderRaw(nodeTypes.TEXT, content));
    });
}
