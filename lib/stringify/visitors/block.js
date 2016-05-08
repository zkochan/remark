'use strict'
var BREAK = '\n\n'
var GAP = BREAK + '\n'

/**
 * Stringify a block node with block children (e.g., `root`
 * or `blockquote`).
 *
 * Knows about code following a list, or adjacent lists
 * with similar bullets, and places an extra newline
 * between them.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.block({
 *     type: 'root',
 *     children: [{
 *       type: 'paragraph',
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   });
 *   // 'bar'
 *
 * @param {Object} node - `root` node.
 * @return {string} - Markdown block content.
 */
module.exports = function (compiler, node) {
  var values = []
  var children = node.children
  var length = children.length
  var index = -1
  var child
  var prev

  while (++index < length) {
    child = children[index]

    if (prev) {
      /*
       * Duplicate nodes, such as a list
       * directly following another list,
       * often need multiple new lines.
       *
       * Additionally, code blocks following a list
       * might easily be mistaken for a paragraph
       * in the list itself.
       */

      if (child.type === prev.type && prev.type === 'list') {
        values.push(prev.ordered === child.ordered ? GAP : BREAK)
      } else if (
          prev.type === 'list' &&
          child.type === 'code' &&
          !child.lang
      ) {
        values.push(GAP)
      } else {
        values.push(BREAK)
      }
    }

    values.push(compiler.visit(child, node))

    prev = child
  }

  return values.join('')
}
