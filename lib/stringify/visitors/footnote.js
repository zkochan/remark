'use strict'

/**
 * Stringify a footnote.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.footnote({
 *     type: 'footnote',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *   // '[^Foo]'
 *
 * @param {Object} node - `footnote` node.
 * @return {string} - Markdown footnote.
 */
module.exports = function (compiler, node) {
  return '[^' + compiler.all(node).join('') + ']'
}
