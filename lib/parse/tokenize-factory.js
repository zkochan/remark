'use strict'

module.exports = tokenizeFactory

var utilities = require('../utilities')
var mergeable = utilities.mergeable
var MERGEABLE_NODES = utilities.MERGEABLE_NODES
const runAsync = require('run-async')

/*
 * Error messages.
 */

var ERR_INFINITE_LOOP = 'Infinite loop'
var ERR_INCORRECTLY_EATEN = 'Incorrectly eaten value: please report this ' +
    'warning on http://git.io/vg5Ft'

/**
 * Construct a tokenizer.  This creates both
 * `tokenizeInline` and `tokenizeBlock`.
 *
 * @example
 *   Parser.prototype.tokenizeInline = tokenizeFactory('inline')
 *
 * @param {string} type - Name of parser, used to find
 *   its expressions (`%sMethods`) and tokenizers
 *   (`%Tokenizers`).
 * @return {Function} - Tokenizer.
 */
function tokenizeFactory (type) {
  /**
   * Tokenizer for a bound `type`
   *
   * @example
   *   parser = new Parser()
   *   parser.tokenizeInline('_foo_')
   *
   * @param {string} value - Content.
   * @param {Object?} [location] - Offset at which `value`
   *   starts.
   * @return {Array.<Object>} - Nodes.
   */
  function tokenize (value, location) {
    var self = this
    var offset = self.offset
    var tokens = []
    var methods = self[type + 'Methods']
    var tokenizers = self[type + 'Tokenizers']
    var line = location ? location.line : 1
    var column = location ? location.column : 1

    /*
     * Trim white space only lines.
     */

    if (!value) {
      return Promise.resolve(tokens)
    }

    /**
     * Update line, column, and offset based on
     * `value`.
     *
     * @example
     *   updatePosition('foo')
     *
     * @param {string} subvalue - Subvalue to eat.
     */
    function updatePosition (subvalue) {
      var lastIndex = -1
      var index = subvalue.indexOf('\n')

      while (index !== -1) {
        line++
        lastIndex = index
        index = subvalue.indexOf('\n', index + 1)
      }

      if (lastIndex === -1) {
        column += subvalue.length
      } else {
        column = subvalue.length - lastIndex
      }

      if (line in offset) {
        if (lastIndex !== -1) {
          column += offset[line]
        } else if (column <= offset[line]) {
          column = offset[line] + 1
        }
      }
    }

    /**
     * Get offset. Called before the first character is
     * eaten to retrieve the range's offsets.
     *
     * @return {Function} - `done`, to be called when
     *   the last character is eaten.
     */
    function getOffset () {
      var indentation = []
      var pos = line + 1

      /**
       * Done. Called when the last character is
       * eaten to retrieve the range’s offsets.
       *
       * @return {Array.<number>} - Offset.
       */
      function done () {
        var last = line + 1

        while (pos < last) {
          indentation.push((offset[pos] || 0) + 1)

          pos++
        }

        return indentation
      }

      return done
    }

    /**
     * Get the current position.
     *
     * @example
     *   position = now() // {line: 1, column: 1, offset: 0}
     *
     * @return {Object} - Current Position.
     */
    function now () {
      var pos = { line, column }

      pos.offset = self.toOffset(pos)

      return pos
    }

    /**
     * Store position information for a node.
     *
     * @example
     *   start = now()
     *   updatePosition('foo')
     *   location = new Position(start)
     *   // {
     *   //   start: {line: 1, column: 1, offset: 0},
     *   //   end: {line: 1, column: 3, offset: 2}
     *   // }
     *
     * @param {Object} start - Starting position.
     */
    function Position(start) {
      this.start = start
      this.end = now()
    }

    /**
     * Throw when a value is incorrectly eaten.
     * This shouldn’t happen but will throw on new,
     * incorrect rules.
     *
     * @example
     *   // When the current value is set to `foo bar`.
     *   validateEat('foo')
     *   eat('foo')
     *
     *   validateEat('bar')
     *   // throws, because the space is not eaten.
     *
     * @param {string} subvalue - Value to be eaten.
     * @throws {Error} - When `subvalue` cannot be eaten.
     */
    function validateEat(subvalue) {
      /* istanbul ignore if */
      if (value.substring(0, subvalue.length) !== subvalue) {
        throw new Error(ERR_INCORRECTLY_EATEN)
        self.file.fail(ERR_INCORRECTLY_EATEN, now())
      }
    }

    /**
     * Mark position and patch `node.position`.
     *
     * @example
     *   var update = position()
     *   updatePosition('foo')
     *   update({})
     *   // {
     *   //   position: {
     *   //     start: {line: 1, column: 1, offset: 0},
     *   //     end: {line: 1, column: 3, offset: 2}
     *   //   }
     *   // }
     *
     * @returns {Function} - Updater.
     */
    function position () {
      var before = now()

      /**
       * Add the position to a node.
       *
       * @example
       *   update({type: 'text', value: 'foo'})
       *
       * @param {Node} node - Node to attach position
       *   on.
       * @param {Array} [indent] - Indentation for
       *   `node`.
       * @return {Node} - `node`.
       */
      function update (node, indent) {
        var prev = node.position
        var start = prev ? prev.start : before
        var combined = []
        var n = prev && prev.end.line
        var l = before.line

        node.position = new Position(start)

        /*
         * If there was already a `position`, this
         * node was merged.  Fixing `start` wasn’t
         * hard, but the indent is different.
         * Especially because some information, the
         * indent between `n` and `l` wasn’t
         * tracked.  Luckily, that space is
         * (should be?) empty, so we can safely
         * check for it now.
         */

        if (prev && indent && prev.indent) {
          combined = prev.indent

          if (n < l) {
            while (++n < l) {
              combined.push((offset[n] || 0) + 1)
            }

            combined.push(before.column)
          }

          indent = combined.concat(indent)
        }

        node.position.indent = indent || []

        return node
      }

      return update
    }

    /**
     * Add `node` to `parent`s children or to `tokens`.
     * Performs merges where possible.
     *
     * @example
     *   add({})
     *
     *   add({}, {children: []})
     *
     * @param {Object} node - Node to add.
     * @param {Object} [parent] - Parent to insert into.
     * @return {Object} - Added or merged into node.
     */
    function add (node, parent) {
      var prev
      var children

      if (!parent) {
        children = tokens
      } else {
        children = parent.children
      }

      prev = children[children.length - 1]

      if (
        prev &&
        node.type === prev.type &&
        node.type in MERGEABLE_NODES &&
        mergeable(prev) &&
        mergeable(node)
      ) {
        node = MERGEABLE_NODES[node.type].call(
          self, prev, node
        )
      }

      if (node !== prev) {
        children.push(node)
      }

      if (self.atStart && tokens.length) {
        self.exitStart()
      }

      return node
    }

    /**
     * Remove `subvalue` from `value`.
     * Expects `subvalue` to be at the start from
     * `value`, and applies no validation.
     *
     * @example
     *   eat('foo')({type: 'text', value: 'foo'})
     *
     * @param {string} subvalue - Removed from `value`,
     *   and passed to `updatePosition`.
     * @return {Function} - Wrapper around `add`, which
     *   also adds `position` to node.
     */
    function eat (subvalue) {
      var indent = getOffset()
      var pos = position()
      var current = now()

      validateEat(subvalue)

      /**
       * Add the given arguments, add `position` to
       * the returned node, and return the node.
       *
       * @param {Object} node - Node to add.
       * @param {Object} [parent] - Node to insert into.
       * @return {Node} - Added node.
       */
      function apply (node, parent) {
        return (node instanceof Promise)
          ? node.then(updatePos)
          : Promise.resolve(updatePos(node))

        function updatePos (node) {
          return pos(add(pos(node), parent), indent)
        }
      }

      /**
       * Functions just like apply, but resets the
       * content:  the line and column are reversed,
       * and the eaten value is re-added.
       *
       * This is useful for nodes with a single
       * type of content, such as lists and tables.
       *
       * See `apply` above for what parameters are
       * expected.
       *
       * @return {Node} - Added node.
       */
      function reset () {
        return apply.apply(null, arguments)
          .then(node => {
            line = current.line
            column = current.column
            value = subvalue + value

            return node
          })
      }

      /**
       * Test the position, after eating, and reverse
       * to a not-eaten state.
       *
       * @return {Position} - Position after eating `subvalue`.
       */
      function test () {
        var result = pos({})

        line = current.line
        column = current.column
        value = subvalue + value

        return result.position
      }

      apply.reset = reset
      apply.test = reset.test = test

      value = value.substring(subvalue.length)

      updatePosition(subvalue)

      indent = indent()

      return apply
    }

    /*
     * Expose `now` on `eat`.
     */

    eat.now = now

    /*
     * Expose `file` on `eat`.
     */

    eat.file = self.file

    /*
     * Sync initial offset.
     */

    updatePosition('')

    /*
     * Iterate over `value`, and iterate over all
     * tokenizers.  When one eats something, re-iterate
     * with the remaining value.  If no tokenizer eats,
     * something failed (should not happen) and an
     * exception is thrown.
     */

    function process () {
      if (value) {
        return matchMethods(methods.slice())
          .then(() => process())
      }

      self.eof = now()

      return Promise.resolve(tokens)

      function matchMethods (methods) {
        var name = methods.shift()
        if (!name) {
          self.file.fail(ERR_INFINITE_LOOP, eat.now())
          return Promise.resolve()
        }

        var method = tokenizers[name]

        if (
          method &&
          (!method.onlyAtStart || self.atStart) &&
          (!method.onlyAtTop || self.atTop) &&
          (!method.notInBlockquote || !self.inBlockquote) &&
          (!method.notInLink || !self.inLink)
        ) {
          var valueLength = value.length

          return runAsync(method.bind(self))(eat, value)
            .then(() => {
              var matched = valueLength !== value.length

              if (!matched) {
                return matchMethods(methods)
              }

              return Promise.resolve()
            })
        }

        return matchMethods(methods)
      }
    }

    return process()
  }

  return tokenize
}
