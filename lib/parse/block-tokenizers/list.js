'use strict'

module.exports = tokenizeList

var isNumeric = require('../is-numeric')
var nodeTypes = require('../node-types')
var trim = require('trim')

var TAB_SIZE = require('../shared-constants').TAB_SIZE
var RULE_MARKERS = require('../shared-constants').RULE_MARKERS

/*
 * A map of characters which can be used to mark
 * list-items.
 */

var LIST_UNORDERED_MARKERS = {}

LIST_UNORDERED_MARKERS['*'] = true
LIST_UNORDERED_MARKERS['+'] = true
LIST_UNORDERED_MARKERS['-'] = true

/*
 * A map of characters which can be used to mark
 * list-items after a digit.
 */

var LIST_ORDERED_MARKERS = {}

LIST_ORDERED_MARKERS['.'] = true

/*
 * A map of characters which can be used to mark
 * list-items after a digit.
 */

var LIST_ORDERED_COMMONMARK_MARKERS = {}

LIST_ORDERED_COMMONMARK_MARKERS['.'] = true
LIST_ORDERED_COMMONMARK_MARKERS[')'] = true

/**
 * Tokenise a list.
 *
 * @example
 *   tokenizeList(eat, '- Foo')
 *
 * @param {function(string)} eat - Eater.
 * @param {string} value - Rest of content.
 * @param {boolean?} [silent] - Whether this is a dry run.
 * @return {Node?|boolean} - `list` node.
 */
function tokenizeList (eat, value, silent) {
  var self = this
  var commonmark = self.options.commonmark
  var pedantic = self.options.pedantic
  var tokenizers = self.blockTokenizers
  var markers
  var index = 0
  var length = value.length
  var start = null
  var queue
  var ordered
  var character
  var marker
  var nextIndex
  var startIndex
  var prefixed
  var currentMarker
  var content
  var line
  var prevEmpty
  var empty
  var items
  var allLines
  var emptyLines
  var item
  var enterTop
  var exitBlockquote
  var isLoose
  var node
  var now
  var end
  var indented
  var size

  while (index < length) {
    character = value.charAt(index)

    if (character !== ' ' && character !== '\t') {
      break
    }

    index++
  }

  character = value.charAt(index)

  markers = commonmark
    ? LIST_ORDERED_COMMONMARK_MARKERS
    : LIST_ORDERED_MARKERS

  if (LIST_UNORDERED_MARKERS[character] === true) {
    marker = character
    ordered = false
  } else {
    ordered = true
    queue = ''

    while (index < length) {
      character = value.charAt(index)

      if (!isNumeric(character)) {
        break
      }

      queue += character
      index++
    }

    character = value.charAt(index)

    if (!queue || markers[character] !== true) {
      return
    }

    start = parseInt(queue, 10)
    marker = character
  }

  character = value.charAt(++index)

  if (character !== ' ' && character !== '\t') {
    return
  }

  if (silent) {
    return true
  }

  index = 0
  items = []
  allLines = []
  emptyLines = []

  while (index < length) {
    nextIndex = value.indexOf('\n', index)
    startIndex = index
    prefixed = false
    indented = false

    if (nextIndex === -1) {
      nextIndex = length
    }

    end = index + TAB_SIZE
    size = 0

    while (index < length) {
      character = value.charAt(index)

      if (character === '\t') {
        size += TAB_SIZE - size % TAB_SIZE
      } else if (character === ' ') {
        size++
      } else {
        break
      }

      index++
    }

    if (size >= TAB_SIZE) {
      indented = true
    }

    if (item && size >= item.indent) {
      indented = true
    }

    character = value.charAt(index)
    currentMarker = null

    if (!indented) {
      if (LIST_UNORDERED_MARKERS[character] === true) {
        currentMarker = character
        index++
        size++
      } else {
        queue = ''

        while (index < length) {
          character = value.charAt(index)

          if (!isNumeric(character)) {
            break
          }

          queue += character
          index++
        }

        character = value.charAt(index)
        index++

        if (queue && markers[character] === true) {
          currentMarker = character
          size += queue.length + 1
        }
      }

      if (currentMarker) {
        character = value.charAt(index)

        if (character === '\t') {
          size += TAB_SIZE - size % TAB_SIZE
          index++
        } else if (character === ' ') {
          end = index + TAB_SIZE

          while (index < end) {
            if (value.charAt(index) !== ' ') {
              break
            }

            index++
            size++
          }

          if (index === end && value.charAt(index) === ' ') {
            index -= TAB_SIZE - 1
            size -= TAB_SIZE - 1
          }
        } else if (
          character !== '\n' &&
          character !== ''
        ) {
          currentMarker = null
        }
      }
    }

    if (currentMarker) {
      if (commonmark && marker !== currentMarker) {
        break
      }

      prefixed = true
    } else {
      if (
        !commonmark &&
        !indented &&
        value.charAt(startIndex) === ' '
      ) {
        indented = true
      } else if (
        commonmark &&
        item
      ) {
        indented = size >= item.indent || size > TAB_SIZE
      }

      prefixed = false
      index = startIndex
    }

    line = value.slice(startIndex, nextIndex)
    content = startIndex === index ? line : value.slice(index, nextIndex)

    if (currentMarker && RULE_MARKERS[currentMarker] === true) {
      if (
        tokenizers.thematicBreak.call(self, eat, line, true)
      ) {
        break
      }
    }

    prevEmpty = empty
    empty = !trim(content).length

    if (indented && item) {
      item.value = item.value.concat(emptyLines, line)
      allLines = allLines.concat(emptyLines, line)
      emptyLines = []
    } else if (prefixed) {
      if (emptyLines.length) {
        item.value.push('')
        item.trail = emptyLines.concat()
      }

      item = {
        // 'bullet': value.slice(startIndex, index),
        'value': [line],
        'indent': size,
        'trail': []
      }

      items.push(item)
      allLines = allLines.concat(emptyLines, line)
      emptyLines = []
    } else if (empty) {
      // TODO: disable when in pedantic-mode.
      if (prevEmpty) {
        break
      }

      emptyLines.push(line)
    } else {
      if (prevEmpty) {
        break
      }

      if (
        !pedantic &&
        (
            tokenizers.fences.call(self, eat, line, true) ||
            tokenizers.thematicBreak.call(self, eat, line, true)
        )
      ) {
        break
      }

      if (!commonmark) {
        if (
          tokenizers.definition.call(self, eat, line, true) ||
          tokenizers.footnoteDefinition.call(self, eat, line, true)
        ) {
          break
        }
      }

      item.value = item.value.concat(emptyLines, line)
      allLines = allLines.concat(emptyLines, line)
      emptyLines = []
    }

    index = nextIndex + 1
  }

  return eat(allLines.join('\n')).reset({
    type: nodeTypes.LIST,
    ordered: ordered,
    start: start,
    loose: null,
    children: []
  })
  .then(node => {
    enterTop = self.exitTop()
    exitBlockquote = self.enterBlockquote()
    isLoose = false
    length = items.length
    const parent = node

    return tokenizeEach(items)
      .then(() => {
        enterTop()
        exitBlockquote()

        node.loose = isLoose

        return node
      })

    function tokenizeEach (items) {
      const rawItem = items.shift()
      if (!rawItem) return
      const item = rawItem.value.join('\n')
      now = eat.now()

      return eat(item)(self.renderListItem(item, now), parent)
        .then(item => {
          if (item.loose) {
            isLoose = true
          }

          item = rawItem.trail.join('\n')

          if (items.length) {
            item += '\n'
          }

          eat(item)

          return tokenizeEach(items)
        })
    }
  })
}
