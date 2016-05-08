'use strict'
var repeat = require('repeat-string')

/**
 * Stringify a horizontal rule.
 *
 * The character used is configurable by `rule`: (`'_'`)
 *
 *     ___
 *
 * The number of repititions is defined through
 * `ruleRepetition`: (`6`)
 *
 *     ******
 *
 * Whether spaces delimit each character, is configured
 * through `ruleSpaces`: (`true`)
 *
 *     * * *
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.thematicBreak({
 *     type: 'thematicBreak'
 *   });
 *   // '***'
 *
 * @return {string} - Markdown rule.
 */
module.exports = function (compiler) {
  var options = compiler.options
  var rule = repeat(options.rule, options.ruleRepetition)

  if (options.ruleSpaces) {
    rule = rule.split('').join(' ')
  }

  return rule
}
