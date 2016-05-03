'use strict'

module.exports = tokenizeEmphasis

var isWhiteSpace = require('../is-white-space')
var isAlphabetic = require('../is-alphabetic')
var isNumeric = require('../is-numeric')
var trim = require('trim')
var nodeTypes = require('../node-types')

/*
 * A map of characters, which can be used to mark emphasis.
 */

var EMPHASIS_MARKERS = {}

EMPHASIS_MARKERS['*'] = true
EMPHASIS_MARKERS['_'] = true

/**
 * Check whether `character` is a word character.
 *
 * @param {string} character - Single character to check.
 * @return {boolean} - Whether `character` is a word
 *   character.
 */
function isWordCharacter (character) {
  return character === '_' ||
        isAlphabetic(character) ||
        isNumeric(character)
}

/**
 * Find possible slight emphasis.
 *
 * @example
 *   locateEmphasis('foo *bar'); // 4
 *
 * @param {string} value - Value to search.
 * @param {number} fromIndex - Index to start searching at.
 * @return {number} - Location of possible slight emphasis.
 */
function locateEmphasis (value, fromIndex) {
  var asterisk = value.indexOf('*', fromIndex)
  var underscore = value.indexOf('_', fromIndex)

  if (underscore === -1) {
      return asterisk
    }

  if (asterisk === -1) {
      return underscore
    }

  return underscore < asterisk ? underscore : asterisk
}

/**
 * Tokenise slight emphasis.
 *
 * @example
 *   tokenizeEmphasis(eat, '*foo*');
 *   tokenizeEmphasis(eat, '_foo_');
 *
 * @property {Function} locator - Slight emphasis locator.
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `emphasis` node.
 */
function tokenizeEmphasis (eat, value, silent) {
  var self = this
  var index = 0
  var character = value.charAt(index)
  var now
  var pedantic
  var marker
  var queue
  var subvalue
  var length
  var prev

  if (EMPHASIS_MARKERS[character] !== true) {
      return
    }

  pedantic = self.options.pedantic
  subvalue = marker = character
  length = value.length
  index++
  queue = character = ''

  if (pedantic && isWhiteSpace(value.charAt(index))) {
      return
    }

  while (index < length) {
      prev = character
      character = value.charAt(index)

      if (
            character === marker &&
            (!pedantic || !isWhiteSpace(prev))
        ) {
          character = value.charAt(++index)

          if (character !== marker) {
              if (!trim(queue) || prev === marker) {
                  return
                }

              if (
                    pedantic ||
                    marker !== '_' ||
                    !isWordCharacter(character)
                ) {
                    /* istanbul ignore if - never used (yet) */
                  if (silent) {
                      return true
                    }

                  now = eat.now()
                  now.column++
                  now.offset++

                  return eat(subvalue + queue + marker)(
                        self.renderInline(nodeTypes.EMPHASIS, queue, now)
                    )
                }
            }

          queue += marker
        }

      if (!pedantic && character === '\\') {
          queue += character
          character = value.charAt(++index)
        }

      queue += character
      index++
    }
}

tokenizeEmphasis.locator = locateEmphasis
