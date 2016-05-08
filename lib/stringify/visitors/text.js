'use strict'

/**
 * Stringify text.
 *
 * Supports named entities in `settings.encode: true` mode:
 *
 *     AT&amp;T
 *
 * Supports numbered entities in `settings.encode: numbers`
 * mode:
 *
 *     AT&#x26;T
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.text({
 *     type: 'text',
 *     value: 'foo'
 *   });
 *   // 'foo'
 *
 * @param {Object} node - `text` node.
 * @param {Object} parent - Parent of `node`.
 * @return {string} - Raw markdown text.
 */
module.exports = function (compiler, node, parent) {
  return compiler.encode(compiler.escape(node.value, node, parent), node)
}
