'use strict'
const pad = require('./pad')
const repeat = require('repeat-string')
const longestStreak = require('longest-streak')
var MINIMUM_CODE_FENCE_LENGTH = 3
var ERROR_LIST_ITEM_INDENT = 'Cannot indent code properly. See ' +
    'http://git.io/vgFvT'
var LIST_ITEM_TAB = 'tab'
/*
 * Naive fence expression.
 */

var FENCE = /([`~])\1{2}/

/**
 * Stringify a code block.
 *
 * Creates indented code when:
 *
 * - No language tag exists;
 * - Not in `fences: true` mode;
 * - A non-'' value exists.
 *
 * Otherwise, GFM fenced code is created:
 *
 *     ```js
 *     foo();
 *     ```
 *
 * When in ``fence: `~` `` mode, uses tildes as fences:
 *
 *     ~~~js
 *     foo();
 *     ~~~
 *
 * Knows about internal fences (Note: GitHub/Kramdown does
 * not support this):
 *
 *     ````javascript
 *     ```markdown
 *     foo
 *     ```
 *     ````
 *
 * Supports named entities in the language flag with
 * `settings.encode` mode.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.code({
 *     type: 'code',
 *     lang: 'js',
 *     value: 'fooo();'
 *   });
 *   // '```js\nfooo();\n```'
 *
 * @param {Object} node - `code` node.
 * @param {Object} parent - Parent of `node`.
 * @return {string} - Markdown code block.
 */
module.exports = function (compiler, node, parent) {
  var value = node.value
  var options = compiler.options
  var marker = options.fence
  var language = compiler.encode(node.lang || '', node)
  var fence

    /*
     * Without (needed) fences.
     */

  if (!language && !options.fences && value) {
    /*
     * Throw when pedantic, in a list item which
     * isn’t compiled using a tab.
     */

    if (
        parent &&
        parent.type === 'listItem' &&
        options.listItemIndent !== LIST_ITEM_TAB &&
        options.pedantic
    ) {
      compiler.file.fail(ERROR_LIST_ITEM_INDENT, node.position)
    }

    return pad(value, 1)
  }

  fence = longestStreak(value, marker) + 1

    /*
     * Fix GFM / RedCarpet bug, where fence-like characters
     * inside fenced code can exit a code-block.
     * Yes, even when the outer fence uses different
     * characters, or is longer.
     * Thus, we can only pad the code to make it work.
     */

  if (FENCE.test(value)) {
    value = pad(value, 1)
  }

  fence = repeat(marker, Math.max(fence, MINIMUM_CODE_FENCE_LENGTH))

  return fence + language + '\n' + value + '\n' + fence
}
