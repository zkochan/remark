'use strict'
var repeat = require('repeat-string')
var YAML_FENCE_LENGTH = 3

/**
 * Stringify YAML front matter.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.yaml({
 *     type: 'yaml',
 *     value: 'foo: bar'
 *   });
 *   // '---\nfoo: bar\n---'
 *
 * @param {Object} node - `yaml` node.
 * @return {string} - Markdown YAML document.
 */
module.exports = function (compiler, node) {
  var delimiter = repeat('-', YAML_FENCE_LENGTH)
  var value = node.value ? '\n' + node.value : ''

  return delimiter + value + '\n' + delimiter
}
