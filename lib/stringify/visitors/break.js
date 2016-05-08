'use strict'

/**
 * Stringify a hard break.
 *
 * In Commonmark mode, trailing '\\' form is used in order
 * to preserve trailing whitespace that the line may end with,
 * and also for better visibility.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.break({
 *     type: 'break'
 *   });
 *   // '  \n'
 *
 * @return {string} - Hard markdown break.
 */
module.exports = function (compiler) {
  return compiler.options.commonmark ? '\\\n' : '  \n'
}
