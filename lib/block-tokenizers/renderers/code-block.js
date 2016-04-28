'use strict'

module.exports = renderCodeBlock

var nodeTypes = require('../../node-types')
var trimTrailingLines = require('trim-trailing-lines');

/**
 * Create a code-block node.
 *
 * @example
 *   renderCodeBlock('foo()', 'js', now());
 *
 * @param {string?} [value] - Code.
 * @param {string?} [language] - Optional language flag.
 * @param {Function} eat - Eater.
 * @return {Object} - `code` node.
 */
function renderCodeBlock(value, language) {
    return {
        'type': nodeTypes.CODE,
        'lang': language || null,
        'value': trimTrailingLines(value || '')
    };
}
