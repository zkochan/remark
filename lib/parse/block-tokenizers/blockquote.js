'use strict'
module.exports = tokenizeBlockquote

var trim = require('trim');

/**
 * Tokenise a blockquote.
 *
 * @example
 *   tokenizeBlockquote(eat, '> Foo');
 *
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `blockquote` node.
 */
function tokenizeBlockquote(eat, value, silent) {
    var self = this;
    var commonmark = self.options.commonmark;
    var now = eat.now();
    var indent = self.indent(now.line);
    var length = value.length;
    var values = [];
    var contents = [];
    var indents = [];
    var add;
    var tokenizers;
    var index = 0;
    var character;
    var rest;
    var nextIndex;
    var content;
    var line;
    var startIndex;
    var prefixed;

    while (index < length) {
        character = value.charAt(index);

        if (character !== ' ' && character !== '\t') {
            break;
        }

        index++;
    }

    if (value.charAt(index) !== '>') {
        return;
    }

    if (silent) {
        return true;
    }

    tokenizers = self.blockTokenizers;
    index = 0;

    while (index < length) {
        nextIndex = value.indexOf('\n', index);
        startIndex = index;
        prefixed = false;

        if (nextIndex === -1) {
            nextIndex = length;
        }

        while (index < length) {
            character = value.charAt(index);

            if (character !== ' ' && character !== '\t') {
                break;
            }

            index++;
        }

        if (value.charAt(index) === '>') {
            index++;
            prefixed = true;

            if (value.charAt(index) === ' ') {
                index++;
            }
        } else {
            index = startIndex;
        }

        content = value.slice(index, nextIndex);

        if (!prefixed && !trim(content)) {
            index = startIndex;
            break;
        }

        if (!prefixed) {
            rest = value.slice(index);

            if (
                commonmark &&
                (
                    tokenizers.code.call(self, eat, rest, true) ||
                    tokenizers.fences.call(self, eat, rest, true) ||
                    tokenizers.heading.call(self, eat, rest, true) ||
                    tokenizers.lineHeading.call(self, eat, rest, true) ||
                    tokenizers.thematicBreak.call(self, eat, rest, true) ||
                    tokenizers.html.call(self, eat, rest, true) ||
                    tokenizers.list.call(self, eat, rest, true)
                )
            ) {
                break;
            }

            if (
                !commonmark &&
                (
                    tokenizers.definition.call(self, eat, rest, true) ||
                    tokenizers.footnoteDefinition.call(self, eat, rest, true)
                )
            ) {
                break;
            }
        }

        line = startIndex === index ?
            content :
            value.slice(startIndex, nextIndex);

        indents.push(index - startIndex);
        values.push(line);
        contents.push(content);

        index = nextIndex + 1;
    }

    index = -1;
    length = indents.length;
    add = eat(values.join('\n'));

    while (++index < length) {
        indent(indents[index]);
    }

    return add(self.renderBlockquote(contents.join('\n'), now));
}