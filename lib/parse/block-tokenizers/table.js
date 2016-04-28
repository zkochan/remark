'use strict'

module.exports = tokenizeTable

var isWhiteSpace = require('../is-white-space')
var nodeTypes = require('../node-types')

var MIN_TABLE_COLUMNS = 2;
var MIN_TABLE_ROWS = 2;

/*
 * Available table alignments.
 */

var TABLE_ALIGN_LEFT = 'left';
var TABLE_ALIGN_CENTER = 'center';
var TABLE_ALIGN_RIGHT = 'right';
var TABLE_ALIGN_NONE = null;

/**
 * Tokenise a table.
 *
 * @example
 *   tokenizeTable(eat, ' | foo |\n | --- |\n | bar |');
 *
 * @property {boolean} onlyAtTop
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `table` node.
 */
function tokenizeTable(eat, value, silent) {
    var self = this;
    var index;
    var alignments;
    var alignment;
    var subvalue;
    var row;
    var length;
    var lines;
    var queue;
    var character;
    var hasDash;
    var align;
    var cell;
    var preamble;
    var count;
    var opening;
    var now;
    var position;
    var lineCount;
    var line;
    var rows;
    var table;
    var lineIndex;
    var pipeIndex;
    var first;

    /*
     * Exit when not in gfm-mode.
     */

    if (!self.options.gfm) {
        return;
    }

    /*
     * Get the rows.
     * Detecting tables soon is hard, so there are some
     * checks for performance here, such as the minimum
     * number of rows, and allowed characters in the
     * alignment row.
     */

    index = lineCount = 0;
    length = value.length + 1;
    lines = [];

    while (index < length) {
        lineIndex = value.indexOf('\n', index);
        pipeIndex = value.indexOf('|', index + 1);

        if (lineIndex === -1) {
            lineIndex = value.length;
        }

        if (
            pipeIndex === -1 ||
            pipeIndex > lineIndex
        ) {
            if (lineCount < MIN_TABLE_ROWS) {
                return;
            }

            break;
        }

        lines.push(value.slice(index, lineIndex));
        lineCount++;
        index = lineIndex + 1;
    }

    /*
     * Parse the alignment row.
     */

    subvalue = lines.join('\n');
    alignments = lines.splice(1, 1)[0] || [];
    index = 0;
    length = alignments.length;
    lineCount--;
    alignment = false;
    align = [];

    while (index < length) {
        character = alignments.charAt(index);

        if (character === '|') {
            hasDash = null;

            if (alignment === false) {
                if (first === false) {
                    return;
                }
            } else {
                align.push(alignment);
                alignment = false;
            }

            first = false;
        } else if (character === '-') {
            hasDash = true;
            alignment = alignment || TABLE_ALIGN_NONE;
        } else if (character === ':') {
            if (alignment === TABLE_ALIGN_LEFT) {
                alignment = TABLE_ALIGN_CENTER;
            } else if (hasDash && alignment === TABLE_ALIGN_NONE) {
                alignment = TABLE_ALIGN_RIGHT;
            } else {
                alignment = TABLE_ALIGN_LEFT;
            }
        } else if (!isWhiteSpace(character)) {
            return;
        }

        index++;
    }

    if (alignment !== false) {
        align.push(alignment);
    }

    /*
     * Exit when without enough columns.
     */

    if (align.length < MIN_TABLE_COLUMNS) {
        return;
    }

    /* istanbul ignore if - never used (yet) */
    if (silent) {
        return true;
    }

    /*
     * Parse the rows.
     */

    position = -1;
    rows = [];

    table = eat(subvalue).reset({
        'type': nodeTypes.TABLE,
        'align': align,
        'children': rows
    });

    while (++position < lineCount) {
        line = lines[position];
        row = {
          type: position ? nodeTypes.TABLE_ROW : nodeTypes.TABLE_HEADER,
          children: [],
        };

        /*
         * Eat a newline character when this is not the
         * first row.
         */

        if (position) {
            eat('\n');
        }

        /*
         * Eat the row.
         */

        eat(line).reset(row, table);

        length = line.length + 1;
        index = 0;
        queue = '';
        cell = '';
        preamble = true;
        count = opening = null;

        while (index < length) {
            character = line.charAt(index);

            if (character === '\t' || character === ' ') {
                if (cell) {
                    queue += character;
                } else {
                    eat(character);
                }

                index++;
                continue;
            }

            if (character === '' || character === '|') {
                if (preamble) {
                    eat(character);
                } else {
                    if (character && opening) {
                        queue += character;
                        index++;
                        continue;
                    }

                    if ((cell || character) && !preamble) {
                        subvalue = cell;

                        if (queue.length > 1) {
                            if (character) {
                                subvalue += queue.slice(0, queue.length - 1);
                                queue = queue.charAt(queue.length - 1);
                            } else {
                                subvalue += queue;
                                queue = '';
                            }
                        }

                        now = eat.now();

                        eat(subvalue)(
                            self.renderInline(nodeTypes.TABLE_CELL, cell, now), row
                        );
                    }

                    eat(queue + character);

                    queue = '';
                    cell = '';
                }
            } else {
                if (queue) {
                    cell += queue;
                    queue = '';
                }

                cell += character;

                if (character === '\\' && index !== length - 2) {
                    cell += line.charAt(index + 1);
                    index++;
                }

                if (character === '`') {
                    count = 1;

                    while (line.charAt(index + 1) === character) {
                        cell += character;
                        index++;
                        count++;
                    }

                    if (!opening) {
                        opening = count;
                    } else if (count >= opening) {
                        opening = 0;
                    }
                }
            }

            preamble = false;
            index++;
        }

        /*
         * Eat the alignment row.
         */

        if (!position) {
            eat('\n' + alignments);
        }
    }

    return table;
}

tokenizeTable.onlyAtTop = true;
