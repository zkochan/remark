'use strict'

/**
 * Stringify an emphasis.
 *
 * The marker used is configurable by `emphasis`, which
 * defaults to an underscore (`'_'`) but also accepts an
 * '*' (`'*'`):
 *
 *     *foo*
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.emphasis({
 *     type: 'emphasis',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *   // '_Foo_'
 *
 * @param {Object} node - `emphasis` node.
 * @return {string} - Markdown emphasised text.
 */
module.exports = function (compiler, node) {
  var marker = compiler.options.emphasis

  return marker + compiler.all(node).join('') + marker
}
