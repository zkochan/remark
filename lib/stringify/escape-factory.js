'use strict'

module.exports = escapeFactory

/**
 * Factory to escape characters.
 *
 * @example
 *   var escape = escapeFactory({ commonmark: true });
 *   escape('x*x', { type: 'text', value: 'x*x' }) // 'x\\*x'
 *
 * @param {Object} options - Compiler options.
 * @return {function(value, node, parent): string} - Function which
 *   takes a value and a node and (optionally) its parent and returns
 *   its escaped value.
 */
function escapeFactory (options) {
    /**
     * Escape punctuation characters in a node's value.
     *
     * @param {string} value - Value to escape.
     * @param {Object} node - Node in which `value` exists.
     * @param {Object} [parent] - Parent of `node`.
     * @return {string} - Escaped `value`.
     */
  return function escape (value, node, parent) {
    var self = this
    var gfm = options.gfm
    var commonmark = options.commonmark
    var pedantic = options.pedantic
    var siblings = parent && parent.children
    var index = siblings && siblings.indexOf(node)
    var prev = siblings && siblings[index - 1]
    var next = siblings && siblings[index + 1]
    var length = value.length
    var position = -1
    var queue = []
    var escaped = queue
    var afterNewLine
    var character
    var wordCharBefore
    var wordCharAfter

    if (prev) {
      afterNewLine = prev.type === 'text' && /\n\s*$/.test(prev.value)
    } else if (parent) {
      afterNewLine = parent.type === 'paragraph'
    }

    while (++position < length) {
      character = value.charAt(position)

      if (
          character === BACKSLASH ||
          character === TICK ||
          character === ASTERISK ||
          character === SQUARE_BRACKET_OPEN ||
          (
              character === UNDERSCORE &&
              /*
               * Delegate leading/trailing underscores
               * to the multinode version below.
               */
              0 < position &&
              position < length - 1 &&
              (
                  pedantic ||
                  !isAlphanumeric(value.charAt(position - 1)) ||
                  !isAlphanumeric(value.charAt(position + 1))
              )
          ) ||
          (self.inLink && character === SQUARE_BRACKET_CLOSE) ||
          (
              gfm &&
              character === PIPE &&
              (
                  self.inTable ||
                  isInAlignmentRow(value, position)
              )
          )
      ) {
        afterNewLine = false
        queue.push(BACKSLASH)
      } else if (character === ANGLE_BRACKET_OPEN) {
        afterNewLine = false

        if (commonmark) {
          queue.push(BACKSLASH)
        } else {
          queue.push(ENTITY_ANGLE_BRACKET_OPEN)
          continue
        }
      } else if (
                gfm &&
                !self.inLink &&
                character === COLON &&
                (
                    queue.slice(-6).join(EMPTY) === 'mailto' ||
                    queue.slice(-5).join(EMPTY) === 'https' ||
                    queue.slice(-4).join(EMPTY) === 'http'
                )
            ) {
        afterNewLine = false

        if (commonmark) {
          queue.push(BACKSLASH)
        } else {
          queue.push(ENTITY_COLON)
          continue
        }
            /* istanbul ignore if - Impossible to test with
             * the current set-up.  We need tests which try
             * to force markdown content into the tree. */
      } else if (
                character === AMPERSAND &&
                startsWithEntity(value.slice(position))
            ) {
        afterNewLine = false

        if (commonmark) {
          queue.push(BACKSLASH)
        } else {
          queue.push(ENTITY_AMPERSAND)
          continue
        }
      } else if (
                gfm &&
                character === TILDE &&
                value.charAt(position + 1) === TILDE
            ) {
        queue.push(BACKSLASH, TILDE)
        afterNewLine = false
        position += 1
      } else if (character === LINE) {
        afterNewLine = true
      } else if (afterNewLine) {
        if (
            character === ANGLE_BRACKET_CLOSE ||
            character === HASH ||
            LIST_BULLETS[character]
        ) {
          queue.push(BACKSLASH)
          afterNewLine = false
        } else if (
                character !== SPACE &&
                character !== TAB &&
                character !== CARRIAGE &&
                character !== VERTICAL_TAB &&
                character !== FORM_FEED
            ) {
          afterNewLine = false
        }
      }

      queue.push(character)
    }

        /*
         * Multi-node versions.
         */

    if (siblings && node.type === 'text') {
            /*
             * Check for an opening parentheses after a
             * link-reference (which can be joined by
             * white-space).
             */

      if (
                prev &&
                prev.referenceType === 'shortcut'
            ) {
        position = -1
        length = escaped.length

        while (++position < length) {
          character = escaped[position]

          if (character === SPACE || character === TAB) {
            continue
          }

          if (character === PARENTHESIS_OPEN) {
            escaped[position] = BACKSLASH + character
          }

          if (character === COLON) {
            if (commonmark) {
              escaped[position] = BACKSLASH + character
            } else {
              escaped[position] = ENTITY_COLON
            }
          }

          break
        }
      }

            /*
             * Ensure non-auto-links are not seen as links.
             * This pattern needs to check the preceding
             * nodes too.
             */

      if (
                gfm &&
                !self.inLink &&
                prev &&
                prev.type === 'text' &&
                value.charAt(0) === COLON
            ) {
        queue = prev.value.slice(-6)

        if (
                    queue === 'mailto' ||
                    queue.slice(-5) === 'https' ||
                    queue.slice(-4) === 'http'
                ) {
          if (commonmark) {
            escaped.unshift(BACKSLASH)
          } else {
            escaped.splice(0, 1, ENTITY_COLON)
          }
        }
      }

            /*
             * Escape ampersand if it would otherwise
             * start an entity.
             */

      if (
                next &&
                next.type === 'text' &&
                value.slice(-1) === AMPERSAND &&
                startsWithEntity(AMPERSAND + next.value)
            ) {
        if (commonmark) {
          escaped.splice(escaped.length - 1, 0, BACKSLASH)
        } else {
          escaped.push('amp', SEMICOLON)
        }
      }

            /*
             * Escape double tildes in GFM.
             */

      if (
                gfm &&
                next &&
                next.type === 'text' &&
                value.slice(-1) === TILDE &&
                next.value.charAt(0) === TILDE
            ) {
        escaped.splice(escaped.length - 1, 0, BACKSLASH)
      }

            /*
             * Escape underscores, but not mid-word (unless
             * in pedantic mode).
             */

      wordCharBefore = (
                prev &&
                prev.type === 'text' &&
                isAlphanumeric(prev.value.slice(-1))
            )

      wordCharAfter = (
                next &&
                next.type === 'text' &&
                isAlphanumeric(next.value.charAt(0))
            )

      if (length <= 1) {
        if (
                    value === UNDERSCORE &&
                    (
                        pedantic ||
                        !wordCharBefore ||
                        !wordCharAfter
                    )
                ) {
          escaped.unshift(BACKSLASH)
        }
      } else {
        if (
                    value.charAt(0) === UNDERSCORE &&
                    (
                        pedantic ||
                        !wordCharBefore ||
                        /* istanbul ignore next - only for trees */
                        !isAlphanumeric(value.charAt(1))
                    )
                ) {
          escaped.unshift(BACKSLASH)
        }

        if (
                    value.slice(-1) === UNDERSCORE &&
                    (
                        pedantic ||
                        !wordCharAfter ||
                        /* istanbul ignore next - only for trees */
                        !isAlphanumeric(value.slice(-2).charAt(0))
                    )
                ) {
          escaped.splice(escaped.length - 1, 0, BACKSLASH)
        }
      }
    }

    return escaped.join(EMPTY)
  }
}
