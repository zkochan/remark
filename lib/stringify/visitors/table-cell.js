'use strict'

/**
 * Stringify a table cell.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.tableCell({
 *     type: 'tableCell',
 *     children: [{
 *       type: 'text'
 *       value: 'Qux'
 *     }]
 *   });
 *   // 'Qux'
 *
 * @param {Object} node - `tableCell` node.
 * @return {string} - Markdown table cell.
 */
module.exports = function (compiler, node) {
  return compiler.all(node).join('')
}
