'use strict'

/* eslint-env node */

/*
 * Cached method.
 */

var has = Object.prototype.hasOwnProperty

/*
 * Map of overwrites for at-mentions.
 * GitHub does some fancy stuff with `@mention`, by linking
 * it to their blog-post introducing the feature.
 * To my knowledge, there are no other magical usernames.
 */

var OVERWRITES = {}

OVERWRITES.mentions = OVERWRITES.mention = 'blog/821'

/**
 * Find a possible mention.
 *
 * @example
 *   locateMention('foo @bar'); // 4
 *
 * @param {string} value - Value to search.
 * @param {number} fromIndex - Index to start searching at.
 * @return {number} - Location of possible mention sequence.
 */
function locateMention (parser, value, fromIndex) {
  return value.indexOf('@', fromIndex)
}

/**
 * Tokenize a mention.
 *
 * Username may only contain alphanumeric characters or
 * single hyphens, and cannot begin or end with a hyphen.
 *
 * This matches a user, an organization, or a team:
 *
 *   https://github.com/blog/1121-introducing-team-mentions
 *
 * @example
 *   tokenizeMention(eat, '@foo');
 *
 * @property {Function} locator - Mention locator.
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `delete` node.
 */
function mention (parser, value, silent) {
  var match = /^@(\w+)/.exec(value)
  var handle
  var url

  if (match) {
    if (silent) {
      return true
    }

    handle = match[1]
    url = 'https://github.com/'
    url += has.call(OVERWRITES, handle) ? OVERWRITES[handle] : handle

    return parser.eat(match[0])({
      'type': 'link',
      'url': url,
      'children': [{
        'type': 'text',
        'value': match[0],
      }],
    })
  }
}

mention.notInLink = true
mention.locator = locateMention

/**
 * Attacher.
 *
 * @param {Remark} remark - Processor.
 */
function attacher (remark) {
  const inlineTextIndex = remark.inlineTokenizers.findIndex(t => t.name === 'inlineText')
  remark.inlineTokenizers.splice(inlineTextIndex, 0, {
    name: 'mention',
    func: mention,
  })
}

/*
 * Expose.
 */

module.exports = attacher
