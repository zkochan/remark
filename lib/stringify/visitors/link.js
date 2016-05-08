'use strict'
const encloseURI = require('./enclose-uri')
const encloseTitle = require('./enclose-title')

/*
 * Expression for a protocol.
 *
 * @see http://en.wikipedia.org/wiki/URI_scheme#Generic_syntax
 */

var PROTOCOL = /^[a-z][a-z+.-]+:\/?/i
var MAILTO = 'mailto:'

/**
 * Stringify a link.
 *
 * When no title exists, the compiled `children` equal
 * `url`, and `url` starts with a protocol, an auto
 * link is created:
 *
 *     <http://example.com>
 *
 * Otherwise, is smart about enclosing `url` (see
 * `encloseURI()`) and `title` (see `encloseTitle()`).
 *
 *    [foo](<foo at bar '.' com> 'An "example" e-mail')
 *
 * Supports named entities in the `url` and `title` when
 * in `settings.encode` mode.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.link({
 *     type: 'link',
 *     url: 'http://example.com',
 *     title: 'Example Domain',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *   // '[Foo](http://example.com "Example Domain")'
 *
 * @param {Object} node - `link` node.
 * @return {string} - Markdown link.
 */
module.exports = function (compiler, node) {
  var url = compiler.encode(node.url, node)
  var exit = compiler.enterLink()
  var escapedURL = compiler.encode(compiler.escape(node.url, node))
  var value = compiler.all(node).join('')

  exit()

  if (
      node.title === null &&
      PROTOCOL.test(url) &&
      (escapedURL === value || escapedURL === MAILTO + value)
  ) {
    /*
     * '\\' escapes do not work in autolinks,
     * so we do not escape.
     */

    return encloseURI(compiler.encode(node.url), true)
  }

  url = encloseURI(url)

  if (node.title) {
    url += ' ' + encloseTitle(compiler.encode(compiler.escape(node.title, node), node))
  }

  value = `[${value}]`

  value += `(${url})`

  return value
}
