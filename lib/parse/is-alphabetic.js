'use strict'
module.exports = isAlphabetic

var CC_A_LOWER = 'a'.charCodeAt(0)
var CC_A_UPPER = 'A'.charCodeAt(0)
var CC_Z_LOWER = 'z'.charCodeAt(0)
var CC_Z_UPPER = 'Z'.charCodeAt(0)

/**
 * Check whether `character` is alphabetic.
 *
 * @param {string} character - Single character to check.
 * @return {boolean} - Whether `character` is alphabetic.
 */
function isAlphabetic (character) {
  var code = character.charCodeAt(0)

  return (code >= CC_A_LOWER && code <= CC_Z_LOWER) ||
        (code >= CC_A_UPPER && code <= CC_Z_UPPER)
}
