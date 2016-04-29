/**
 * @author Titus Wormer
 * @copyright 2015-2016 Titus Wormer
 * @license MIT
 * @module remark:parse
 * @version 4.2.1
 * @fileoverview Parse a markdown document into an
 *   abstract syntax tree.
 */

'use strict'

/* eslint-env commonjs */

/*
 * Dependencies.
 */

var decode = require('parse-entities')
var repeat = require('repeat-string')
var trim = require('trim')
var extend = require('extend')
var vfileLocation = require('vfile-location')
var removePosition = require('unist-util-remove-position')
var utilities = require('../utilities.js')
var defaultOptions = require('../defaults.js').parse
var tokenizeFactory = require('./tokenize-factory')

/*
 * Methods.
 */

var raise = utilities.raise
var clean = utilities.clean
var validate = utilities.validate
var stateToggler = utilities.stateToggler

/*
 * Numeric constants.
 */

var SPACE_SIZE = 1
var TAB_SIZE = 4

/*
 * Expressions.
 */

var EXPRESSION_BULLET = /^([ \t]*)([*+-]|\d+[.)])( {1,4}(?! )| |\t|$|(?=\n))([^\n]*)/
var EXPRESSION_PEDANTIC_BULLET = /^([ \t]*)([*+-]|\d+[.)])([ \t]+)/
var EXPRESSION_INITIAL_INDENT = /^( {1,4}|\t)?/gm
var EXPRESSION_LOOSE_LIST_ITEM = /\n\n(?!\s*$)/
var EXPRESSION_TASK_ITEM = /^\[([\ \t]|x|X)\][\ \t]/

/*
 * Textual constants.
 */

var nodeTypes = require('./node-types')

/*
 * A map of characters, and their column length,
 * which can be used as indentation.
 */

var INDENTATION_CHARACTERS = {}

INDENTATION_CHARACTERS[' '] = SPACE_SIZE
INDENTATION_CHARACTERS['\t'] = TAB_SIZE

/*
 * A map of two functions which can create list items.
 */

var LIST_ITEM_MAP = {}

LIST_ITEM_MAP.true = renderPedanticListItem
LIST_ITEM_MAP.false = renderNormalListItem

/**
 * Factory to create an entity decoder.
 *
 * @param {Object} context - Context to attach to, e.g.,
 *   a parser.
 * @return {Function} - See `decode`.
 */
function decodeFactory (context) {
  /**
   * Normalize `position` to add an `indent`.
   *
   * @param {Position} position - Reference
   * @return {Position} - Augmented with `indent`.
   */
  function normalize (position) {
    return {
      start: position,
      indent: context.getIndent(position.line),
    }
  }

  /**
   * Handle a warning.
   *
   * @this {VFile} - Virtual file.
   * @param {string} reason - Reason for warning.
   * @param {Position} position - Place of warning.
   * @param {number} code - Code for warning.
   */
  function handleWarning (reason, position, code) {
    if (code === 3) {
      return
    }

    context.file.warn(reason, position)
  }

  /**
   * Decode `value` (at `position`) into text-nodes.
   *
   * @param {string} value - Value to parse.
   * @param {Position} position - Position to start parsing at.
   * @param {Function} handler - Node handler.
   */
  function decoder (value, position, handler) {
    decode(value, {
      position: normalize(position),
      warning: handleWarning,
      text: handler,
      reference: handler,
      textContext: context,
      referenceContext: context,
    })
  }

  /**
   * Decode `value` (at `position`) into a string.
   *
   * @param {string} value - Value to parse.
   * @param {Position} position - Position to start
   *   parsing at.
   * @return {string} - Plain-text.
   */
  function decodeRaw (value, position) {
    return decode(value, {
      position: normalize(position),
      warning: handleWarning,
    })
  }

  decoder.raw = decodeRaw

  return decoder
}

/**
 * Factory to de-escape a value, based on a list at `key`
 * in `scope`.
 *
 * @example
 *   var scope = {escape: ['a']}
 *   var descape = descapeFactory(scope, 'escape')
 *
 * @param {Object} scope - List of escapable characters.
 * @param {string} key - Key in `map` at which the list
 *   exists.
 * @return {function(string): string} - Function which
 *   takes a value and returns its unescaped version.
 */
function descapeFactory (scope, key) {
  /**
   * De-escape a string using the expression at `key`
   * in `scope`.
   *
   * @example
   *   var scope = {escape: ['a']}
   *   var descape = descapeFactory(scope, 'escape')
   *   descape('\a \b') // 'a \b'
   *
   * @param {string} value - Escaped string.
   * @return {string} - Unescaped string.
   */
  function descape (value) {
    var prev = 0
    var index = value.indexOf('\\')
    var escape = scope[key]
    var queue = []
    var character

    while (index !== -1) {
      queue.push(value.slice(prev, index))
      prev = index + 1
      character = value.charAt(prev)

      /*
       * If the following character is not a valid escape,
       * add the slash.
       */

      if (!character || escape.indexOf(character) === -1) {
        queue.push('\\')
      }

      index = value.indexOf('\\', prev)
    }

    queue.push(value.slice(prev))

    return queue.join('')
  }

  return descape
}

/**
 * Gets indentation information for a line.
 *
 * @example
 *   getIndent('  foo')
 *   // {indent: 2, stops: {1: 0, 2: 1}}
 *
 *   getIndent('\tfoo')
 *   // {indent: 4, stops: {4: 0}}
 *
 *   getIndent('  \tfoo')
 *   // {indent: 4, stops: {1: 0, 2: 1, 4: 2}}
 *
 *   getIndent('\t  foo')
 *   // {indent: 6, stops: {4: 0, 5: 1, 6: 2}}
 *
 * @param {string} value - Indented line.
 * @return {Object} - Indetation information.
 */
function getIndent (value) {
  var index = 0
  var indent = 0
  var character = value.charAt(index)
  var stops = {}
  var size

  while (character in INDENTATION_CHARACTERS) {
    size = INDENTATION_CHARACTERS[character]

    indent += size

    if (size > 1) {
      indent = Math.floor(indent / size) * size
    }

    stops[indent] = index

    character = value.charAt(++index)
  }

  return { indent, stops }
}

/**
 * Remove the minimum indent from every line in `value`.
 * Supports both tab, spaced, and mixed indentation (as
 * well as possible).
 *
 * @example
 *   removeIndentation('  foo') // 'foo'
 *   removeIndentation('    foo', 2) // '  foo'
 *   removeIndentation('\tfoo', 2) // '  foo'
 *   removeIndentation('  foo\n bar') // ' foo\n bar'
 *
 * @param {string} value - Value to trim.
 * @param {number?} [maximum] - Maximum indentation
 *   to remove.
 * @return {string} - Unindented `value`.
 */
function removeIndentation (value, maximum) {
  var values = value.split('\n')
  var position = values.length + 1
  var minIndent = Infinity
  var matrix = []
  var index
  var indentation
  var stops
  var padding

  values.unshift(repeat(' ', maximum) + '!')

  while (position--) {
    indentation = getIndent(values[position])

    matrix[position] = indentation.stops

    if (trim(values[position]).length === 0) {
      continue
    }

    if (indentation.indent) {
      if (indentation.indent > 0 && indentation.indent < minIndent) {
        minIndent = indentation.indent
      }
    } else {
      minIndent = Infinity

      break
    }
  }

  if (minIndent !== Infinity) {
    position = values.length

    while (position--) {
      stops = matrix[position]
      index = minIndent

      while (index && !(index in stops)) {
        index--
      }

      if (
        trim(values[position]).length !== 0 &&
        minIndent &&
        index !== minIndent
      ) {
        padding = '\t'
      } else {
        padding = ''
      }

      values[position] = padding + values[position].slice(
        index in stops ? stops[index] + 1 : 0
      )
    }
  }

  values.shift()

  return values.join('\n')
}

/**
 * Create a list-item using overly simple mechanics.
 *
 * @example
 *   renderPedanticListItem('- _foo_', now())
 *
 * @param {string} value - List-item.
 * @param {Object} position - List-item location.
 * @return {string} - Cleaned `value`.
 */
function renderPedanticListItem (value, position) {
  var self = this
  var indent = self.indent(position.line)

  /**
   * A simple replacer which removed all matches,
   * and adds their length to `offset`.
   *
   * @param {string} $0 - Indentation to subtract.
   * @return {string} - An empty string.
   */
  function replacer ($0) {
    indent($0.length)

    return ''
  }

  /*
   * Remove the list-item’s bullet.
   */

  value = value.replace(EXPRESSION_PEDANTIC_BULLET, replacer)

  /*
   * The initial line was also matched by the below, so
   * we reset the `line`.
   */

  indent = self.indent(position.line)

  return value.replace(EXPRESSION_INITIAL_INDENT, replacer)
}

/**
 * Create a list-item using sane mechanics.
 *
 * @example
 *   renderNormalListItem('- _foo_', now())
 *
 * @param {string} value - List-item.
 * @param {Object} position - List-item location.
 * @return {string} - Cleaned `value`.
 */
function renderNormalListItem (value, position) {
  var self = this
  var indent = self.indent(position.line)
  var max
  var bullet
  var rest
  var lines
  var trimmedLines
  var index
  var length

  /*
   * Remove the list-item’s bullet.
   */

  value = value.replace(EXPRESSION_BULLET, function ($0, $1, $2, $3, $4) {
    bullet = $1 + $2 + $3
    rest = $4

    /*
     * Make sure that the first nine numbered list items
     * can indent with an extra space.  That is, when
     * the bullet did not receive an extra final space.
     */

    if (Number($2) < 10 && bullet.length % 2 === 1) {
      $2 = ' ' + $2
    }

    max = $1 + repeat(' ', $2.length) + $3

    return max + rest
  })

  lines = value.split('\n')

  trimmedLines = removeIndentation(
    value, getIndent(max).indent
  ).split('\n')

  /*
   * We replaced the initial bullet with something
   * else above, which was used to trick
   * `removeIndentation` into removing some more
   * characters when possible. However, that could
   * result in the initial line to be stripped more
   * than it should be.
   */

  trimmedLines[0] = rest

  indent(bullet.length)

  index = 0
  length = lines.length

  while (++index < length) {
    indent(lines[index].length - trimmedLines[index].length)
  }

  return trimmedLines.join('\n')
}

/**
 * Create a list-item node.
 *
 * @example
 *   renderListItem('- _foo_', now())
 *
 * @param {Object} value - List-item.
 * @param {Object} position - List-item location.
 * @return {Object} - `listItem` node.
 */
function renderListItem (value, position) {
  const self = this
  let checked = null

  value = LIST_ITEM_MAP[self.options.pedantic].apply(self, arguments)

  if (self.options.gfm) {
    const task = value.match(EXPRESSION_TASK_ITEM)

    if (task) {
      const indent = task[0].length
      checked = task[1].toLowerCase() === 'x'

      self.indent(position.line)(indent)
      value = value.slice(indent)
    }
  }

  return self.tokenizeBlock(value, position)
    .then(children => ({
      type: nodeTypes.LIST_ITEM,
      loose: EXPRESSION_LOOSE_LIST_ITEM.test(value) ||
        value.charAt(value.length - 1) === '\n',
      checked,
      children,
    }))
}

/**
 * Create a footnote-definition node.
 *
 * @example
 *   renderFootnoteDefinition('1', '_foo_', now())
 *
 * @param {string} identifier - Unique reference.
 * @param {string} value - Contents
 * @param {Object} position - Definition location.
 * @return {Object} - `footnoteDefinition` node.
 */
function renderFootnoteDefinition (identifier, value, position) {
  var self = this
  var exitBlockquote = self.enterBlockquote()

  return self.tokenizeBlock(value, position)
    .then(children => {
      exitBlockquote()
      return {
        type: nodeTypes.FOOTNOTE_DEFINITION,
        identifier,
        children,
      }
    })
}

/**
 * Create a heading node.
 *
 * @example
 *   renderHeading('_foo_', 1, now())
 *
 * @param {string} value - Content.
 * @param {number} depth - Heading depth.
 * @param {Object} position - Heading content location.
 * @return {Object} - `heading` node
 */
function renderHeading (value, depth, position) {
  return this.tokenizeInline(value, position)
    .then(children => ({
      type: nodeTypes.HEADING,
      depth,
      children,
    }))
}

/**
 * Create a blockquote node.
 *
 * @example
 *   renderBlockquote('_foo_', eat)
 *
 * @param {string} value - Content.
 * @param {Object} now - Position.
 * @return {Object} - `blockquote` node.
 */
function renderBlockquote (value, now) {
  const self = this
  const exitBlockquote = self.enterBlockquote()

  return self.tokenizeBlock(value, now)
    .then(children => {
      exitBlockquote()
      return {
        type: nodeTypes.BLOCKQUOTE,
        children,
      }
    })
}

/**
 * Create a link node.
 *
 * @example
 *   renderLink(true, 'example.com', 'example', 'Example Domain', now(), eat)
 *   renderLink(false, 'fav.ico', 'example', 'Example Domain', now(), eat)
 *
 * @param {boolean} isLink - Whether linking to a document
 *   or an image.
 * @param {string} url - URI reference.
 * @param {string} text - Content.
 * @param {string?} title - Title.
 * @param {Object} position - Location of link.
 * @return {Object} - `link` or `image` node.
 */
function renderLink (isLink, url, text, title, position) {
  var self = this
  var exitLink = self.enterLink()
  var node

  node = {
    type: isLink ? nodeTypes.LINK : nodeTypes.IMAGE,
    title: title || null
  }

  if (isLink) {
    node.url = url
    return self.tokenizeInline(text, position)
      .then(children => {
        exitLink()
        node.children = children
        return node
      })
  }
  node.url = url
  node.alt = text
    ? self.decode.raw(self.descape(text), position)
    : null
  exitLink()
  return Promise.resolve(node)
}

/**
 * Create a footnote node.
 *
 * @example
 *   renderFootnote('_foo_', now())
 *
 * @param {string} value - Contents.
 * @param {Object} position - Location of footnote.
 * @return {Object} - `footnote` node.
 */
function renderFootnote (value, position) {
  return this.renderInline(nodeTypes.FOOTNOTE, value, position)
}

/**
 * Add a node with inline content.
 *
 * @example
 *   renderInline('strong', '_foo_', now())
 *
 * @param {string} type - Node type.
 * @param {string} value - Contents.
 * @param {Object} position - Location of node.
 * @return {Object} - Node of type `type`.
 */
function renderInline (type, value, position) {
  return this.tokenizeInline(value, position)
    .then(children => ({
      type,
      children,
    }))
}

/**
 * Construct a new parser.
 *
 * @example
 *   var parser = new Parser(new VFile('Foo'))
 *
 * @constructor
 * @class {Parser}
 * @param {VFile} file - File to parse.
 * @param {Object?} [options] - Passed to
 *   `Parser#setOptions()`.
 */
function Parser (file, options, processor) {
  var self = this

  self.file = file
  self.inLink = false
  self.atTop = true
  self.atStart = true
  self.inBlockquote = false
  self.data = processor.data
  self.toOffset = vfileLocation(file).toOffset

  self.descape = descapeFactory(self, 'escape')
  self.decode = decodeFactory(self)

  self.options = extend({}, self.options)

  self.setOptions(options)
}

/**
 * Set options.  Does not overwrite previously set
 * options.
 *
 * @example
 *   var parser = new Parser()
 *   parser.setOptions({gfm: true})
 *
 * @this {Parser}
 * @throws {Error} - When an option is invalid.
 * @param {Object?} [options] - Parse settings.
 * @return {Parser} - `self`.
 */
Parser.prototype.setOptions = function (options) {
  var self = this
  var escape = self.data.escape
  var current = self.options
  var key

  if (options === null || options === undefined) {
    options = {}
  } else if (typeof options === 'object') {
    options = extend({}, options)
  } else {
    raise(options, 'options')
  }

  for (key in defaultOptions) {
    validate.boolean(options, key, current[key])
  }

  self.options = options

  if (options.commonmark) {
    self.escape = escape.commonmark
  } else if (options.gfm) {
    self.escape = escape.gfm
  } else {
    self.escape = escape.default
  }

  return self
}

/*
 * Expose `defaults`.
 */

Parser.prototype.options = defaultOptions

/**
 * Factory to track indentation for each line corresponding
 * to the given `start` and the number of invocations.
 *
 * @param {number} start - Starting line.
 * @return {function(offset)} - Indenter.
 */
Parser.prototype.indent = function (start) {
  var self = this
  var line = start

  /**
   * Intender which increments the global offset,
   * starting at the bound line, and further incrementing
   * each line for each invocation.
   *
   * @example
   *   indenter(2)
   *
   * @param {number} offset - Number to increment the
   *   offset.
   */
  function indenter (offset) {
    self.offset[line] = (self.offset[line] || 0) + offset

    line++
  }

  return indenter
}

/**
 * Get found offsets starting at `start`.
 *
 * @param {number} start - Starting line.
 * @return {Array.<number>} - Offsets starting at `start`.
 */
Parser.prototype.getIndent = function (start) {
  var offset = this.offset
  var result = []

  while (++start) {
    if (!(start in offset)) {
      break
    }

    result.push((offset[start] || 0) + 1)
  }

  return result
}

/**
 * Parse the bound file.
 *
 * @example
 *   new Parser(new File('_Foo_.')).parse()
 *
 * @this {Parser}
 * @return {Object} - `root` node.
 */
Parser.prototype.parse = function () {
  const self = this
  const value = clean(String(self.file))

  /*
   * Add an `offset` matrix, used to keep track of
   * syntax and white space indentation per line.
   */

  self.offset = {}

  return self.tokenizeBlock(value)
    .then(children => {
      const node = {
        type: nodeTypes.ROOT,
        children,
        position: {
          start: {
            line: 1,
            column: 1,
            offset: 0,
          },
        },
      }

      node.position.end = self.eof || extend({}, node.position.start)

      if (!self.options.position) {
        removePosition(node)
      }

      return node
    })
}

/*
 * Enter and exit helpers.
 */

Parser.prototype.enterLink = stateToggler('inLink', false)
Parser.prototype.exitTop = stateToggler('atTop', true)
Parser.prototype.exitStart = stateToggler('atStart', true)
Parser.prototype.enterBlockquote = stateToggler('inBlockquote', false)

/*
 * Expose helpers
 */

Parser.prototype.renderInline = renderInline

Parser.prototype.renderLink = renderLink
Parser.prototype.renderBlockquote = renderBlockquote
Parser.prototype.renderListItem = renderListItem
Parser.prototype.renderFootnoteDefinition = renderFootnoteDefinition
Parser.prototype.renderHeading = renderHeading
Parser.prototype.renderFootnote = renderFootnote

/*
 * Expose tokenizers for block-level nodes.
 */

Parser.prototype.blockTokenizers = {
  'yamlFrontMatter': require('./block-tokenizers/yaml-front-matter'),
  'newline': require('./block-tokenizers/new-line'),
  'code': require('./block-tokenizers/code'),
  'fences': require('./block-tokenizers/fences'),
  'heading': require('./block-tokenizers/heading'),
  'lineHeading': require('./block-tokenizers/line-heading'),
  'thematicBreak': require('./block-tokenizers/thematic-break'),
  'blockquote': require('./block-tokenizers/blockquote'),
  'list': require('./block-tokenizers/list'),
  'html': require('./block-tokenizers/html'),
  'definition': require('./block-tokenizers/definition'),
  'footnoteDefinition': require('./block-tokenizers/footnote'),
  'table': require('./block-tokenizers/table'),
  'paragraph': require('./block-tokenizers/paragraph'),
}

/*
 * Expose order in which to parse block-level nodes.
 */

Parser.prototype.blockMethods = [
  'yamlFrontMatter',
  'newline',
  'code',
  'fences',
  'blockquote',
  'heading',
  'thematicBreak',
  'list',
  'lineHeading',
  'html',
  'footnoteDefinition',
  'definition',
  'looseTable',
  'table',
  'paragraph',
]

/**
 * Block tokenizer.
 *
 * @example
 *   var parser = new Parser()
 *   parser.tokenizeBlock('> foo.')
 *
 * @param {string} value - Content.
 * @return {Array.<Object>} - Nodes.
 */

Parser.prototype.tokenizeBlock = tokenizeFactory('block')

/*
 * Expose tokenizers for inline-level nodes.
 */

Parser.prototype.inlineTokenizers = {
  'escape': require('./inline-tokenizers/escape'),
  'autoLink': require('./inline-tokenizers/auto-link'),
  'url': require('./inline-tokenizers/url'),
  'tag': require('./inline-tokenizers/tag'),
  'link': require('./inline-tokenizers/link'),
  'reference': require('./inline-tokenizers/reference'),
  'strong': require('./inline-tokenizers/strong'),
  'emphasis': require('./inline-tokenizers/emphasis'),
  'deletion': require('./inline-tokenizers/deletion'),
  'inlineCode': require('./inline-tokenizers/code'),
  'break': require('./inline-tokenizers/break'),
  'inlineText': require('./inline-tokenizers/text'),
}

/*
 * Expose order in which to parse inline-level nodes.
 */

Parser.prototype.inlineMethods = [
  'escape',
  'autoLink',
  'url',
  'tag',
  'link',
  'reference',
  'shortcutReference',
  'strong',
  'emphasis',
  'deletion',
  'inlineCode',
  'break',
  'inlineText',
]

/**
 * Inline tokenizer.
 *
 * @example
 *   var parser = new Parser()
 *   parser.tokenizeInline('_foo_')
 *
 * @param {string} value - Content.
 * @return {Array.<Object>} - Nodes.
 */

Parser.prototype.tokenizeInline = tokenizeFactory('inline')

/*
 * Expose `tokenizeFactory` so dependencies could create
 * their own tokenizers.
 */

Parser.prototype.tokenizeFactory = tokenizeFactory

/*
 * Expose `parse` on `module.exports`.
 */

module.exports = Parser
