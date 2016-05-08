'use strict'
const encloseURI = require('./enclose-uri')
const encloseTitle = require('./enclose-title')

/**
 * Stringify a link- or image definition.
 *
 * Is smart about enclosing `url` (see `encloseURI()`) and
 * `title` (see `encloseTitle()`).
 *
 *    [foo]: <foo at bar '.' com> 'An "example" e-mail'
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.definition({
 *     type: 'definition',
 *     url: 'http://example.com',
 *     title: 'Example Domain',
 *     identifier: 'foo'
 *   });
 *   // '[foo]: http://example.com "Example Domain"'
 *
 * @param {Object} node - `definition` node.
 * @return {string} - Markdown link- or image definition.
 */
module.exports = function (compiler, node) {
  var value = `[${node.identifier}]`
  var url = encloseURI(node.url)

  if (node.title) {
    url += ' ' + encloseTitle(node.title)
  }

  return value + ': ' + url
}
