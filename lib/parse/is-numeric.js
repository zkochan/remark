'use strict'

module.exports = isNumeric

var CC_0 = '0'.charCodeAt(0)
var CC_9 = '9'.charCodeAt(0)

/**
 * Check whether `character` is numeric.
 *
 * @param {string} character - Single character to check.
 * @return {boolean} - Whether `character` is numeric.
 */
function isNumeric (character) {
  var code = character.charCodeAt(0)

  return code >= CC_0 && code <= CC_9
}
