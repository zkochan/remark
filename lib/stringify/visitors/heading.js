'use strict'
const repeat = require('repeat-string')

/**
 * Stringify a heading.
 *
 * In `setext: true` mode and when `depth` is smaller than
 * three, creates a setext header:
 *
 *     Foo
 *     ===
 *
 * Otherwise, an ATX header is generated:
 *
 *     ### Foo
 *
 * In `closeAtx: true` mode, the header is closed with
 * '#'es:
 *
 *     ### Foo ###
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.heading({
 *     type: 'heading',
 *     depth: 2,
 *     children: [{
 *       type: 'strong',
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   });
 *   // '## **bar**'
 *
 * @param {Object} node - `heading` node.
 * @return {string} - Markdown heading.
 */
module.exports = function (compiler, node) {
  var setext = compiler.options.setext
  var closeAtx = compiler.options.closeAtx
  var content = compiler.all(node).join('')

  if (setext && node.depth < 3) {
    return content + '\n' + repeat(node.depth === 1 ? '=' : '-', content.length)
  }

  const prefix = repeat('#', node.depth)
  content = prefix + ' ' + content

  if (closeAtx) {
    content += ' ' + prefix
  }

  return content
}
