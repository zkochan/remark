'use strict'

/**
 * Stringify a strong.
 *
 * The marker used is configurable by `strong`, which
 * defaults to an '*' (`'*'`) but also accepts an
 * underscore (`'_'`):
 *
 *     _foo_
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.strong({
 *     type: 'strong',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *   // '**Foo**'
 *
 * @param {Object} node - `strong` node.
 * @return {string} - Markdown strong-emphasised text.
 */
module.exports = function (compiler, node) {
  var marker = compiler.options.strong

  marker = marker + marker

  return marker + compiler.all(node).join('') + marker
}
