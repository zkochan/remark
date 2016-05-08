'use strict'

/**
 * Stringify HTML.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.html({
 *     type: 'html',
 *     value: '<div>bar</div>'
 *   });
 *   // '<div>bar</div>'
 *
 * @param {Object} node - `html` node.
 * @return {string} - Markdown HTML.
 */
module.exports = function (compiler, node) {
  return node.value
}
