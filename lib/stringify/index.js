/**
 * @author Titus Wormer
 * @copyright 2015-2016 Titus Wormer
 * @license MIT
 * @module remark:stringify
 * @version 4.2.1
 * @fileoverview Compile an abstract syntax tree into
 *   a markdown document.
 */

'use strict'

/* eslint-env commonjs */

/*
 * Dependencies.
 */

var table = require('markdown-table')
var repeat = require('repeat-string')
var extend = require('extend')
var ccount = require('ccount')
var longestStreak = require('longest-streak')
var utilities = require('../utilities.js')
var defaultOptions = require('../defaults.js').stringify
const encodeFactory = require('./encode-factory')
const escapeFactory = require('./escape-factory')
const entityPrefixLength = require('./entity-prefix-length')
const LIST_BULLETS = require('./list-bullets')

/*
 * Methods.
 */

var raise = utilities.raise
var validate = utilities.validate
var stateToggler = utilities.stateToggler
var mergeable = utilities.mergeable
var MERGEABLE_NODES = utilities.MERGEABLE_NODES

/*
 * Constants.
 */

var INDENT = 4
var MINIMUM_CODE_FENCE_LENGTH = 3
var YAML_FENCE_LENGTH = 3
var MINIMUM_RULE_LENGTH = 3
var MAILTO = 'mailto:'
var ERROR_LIST_ITEM_INDENT = 'Cannot indent code properly. See ' +
    'http://git.io/vgFvT'

/*
 * Expressions.
 */

var EXPRESSIONS_WHITE_SPACE = /\s/

/*
 * Naive fence expression.
 */

var FENCE = /([`~])\1{2}/

/*
 * Expression for a protocol.
 *
 * @see http://en.wikipedia.org/wiki/URI_scheme#Generic_syntax
 */

var PROTOCOL = /^[a-z][a-z+.-]+:\/?/i

/*
 * Punctuation characters.
 */

var PUNCTUATION = /[-!"#$%&'()*+,.\/:;<=>?@\[\\\]^`{|}~_]/

/*
 * Character combinations.
 */

var BREAK = '\n\n'
var GAP = BREAK + '\n'
var DOUBLE_TILDE = '~~'

/*
 * Allowed entity options.
 */

var ENTITY_OPTIONS = {}

ENTITY_OPTIONS.true = true
ENTITY_OPTIONS.false = true
ENTITY_OPTIONS.numbers = true
ENTITY_OPTIONS.escape = true

/*
 * Allowed horizontal-rule bullet characters.
 */

var THEMATIC_BREAK_BULLETS = {}

THEMATIC_BREAK_BULLETS['*'] = true
THEMATIC_BREAK_BULLETS['-'] = true
THEMATIC_BREAK_BULLETS['_'] = true

/*
 * Allowed emphasis characters.
 */

var EMPHASIS_MARKERS = {}

EMPHASIS_MARKERS['_'] = true
EMPHASIS_MARKERS['*'] = true

/*
 * Allowed fence markers.
 */

var FENCE_MARKERS = {}

FENCE_MARKERS['`'] = true
FENCE_MARKERS['~'] = true

/*
 * Which method to use based on `list.ordered`.
 */

var ORDERED_MAP = {}

ORDERED_MAP.true = 'visitOrderedItems'
ORDERED_MAP.false = 'visitUnorderedItems'

/*
 * Allowed list-item-indent's.
 */

var LIST_ITEM_INDENTS = {}

var LIST_ITEM_TAB = 'tab'
var LIST_ITEM_ONE = '1'
var LIST_ITEM_MIXED = 'mixed'

LIST_ITEM_INDENTS[LIST_ITEM_ONE] = true
LIST_ITEM_INDENTS[LIST_ITEM_TAB] = true
LIST_ITEM_INDENTS[LIST_ITEM_MIXED] = true

/*
 * Which checkbox to use.
 */

var CHECKBOX_MAP = {}

CHECKBOX_MAP.null = ''
CHECKBOX_MAP.undefined = ''
CHECKBOX_MAP.true = '[x] '
CHECKBOX_MAP.false = '[ ] '

/**
 * Wrap `url` in angle brackets when needed, or when
 * forced.
 *
 * In links, images, and definitions, the URL part needs
 * to be enclosed when it:
 *
 * - has a length of `0`;
 * - contains white-space;
 * - has more or less opening than closing parentheses.
 *
 * @example
 *   encloseURI('foo bar') // '<foo bar>'
 *   encloseURI('foo(bar(baz)') // '<foo(bar(baz)>'
 *   encloseURI('') // '<>'
 *   encloseURI('example.com') // 'example.com'
 *   encloseURI('example.com', true) // '<example.com>'
 *
 * @param {string} uri - URI to enclose.
 * @param {boolean?} [always] - Force enclosing.
 * @return {boolean} - Properly enclosed `uri`.
 */
function encloseURI (uri, always) {
  if (
      always ||
      !uri.length ||
      EXPRESSIONS_WHITE_SPACE.test(uri) ||
      ccount(uri, '(') !== ccount(uri, ')')
  ) {
    return '<' + uri + '>'
  }

  return uri
}

/**
 * There is currently no way to support nested delimiters
 * across Markdown.pl, CommonMark, and GitHub (RedCarpet).
 * The following code supports Markdown.pl and GitHub.
 * CommonMark is not supported when mixing double- and
 * single quotes inside a title.
 *
 * @see https://github.com/vmg/redcarpet/issues/473
 * @see https://github.com/jgm/CommonMark/issues/308
 *
 * @example
 *   encloseTitle('foo') // '"foo"'
 *   encloseTitle('foo \'bar\' baz') // '"foo \'bar\' baz"'
 *   encloseTitle('foo "bar" baz') // '\'foo "bar" baz\''
 *   encloseTitle('foo "bar" \'baz\'') // '"foo "bar" \'baz\'"'
 *
 * @param {string} title - Content.
 * @return {string} - Properly enclosed title.
 */
function encloseTitle (title) {
  var delimiter = '"'

  if (title.indexOf(delimiter) !== -1) {
    delimiter = "'"
  }

  return delimiter + title + delimiter
}

/**
 * Pad `value` with `level * INDENT` spaces.  Respects
 * lines. Ignores '' lines.
 *
 * @example
 *   pad('foo', 1) // '    foo'
 *
 * @param {string} value - Content.
 * @param {number} level - Indentation level.
 * @return {string} - Padded `value`.
 */
function pad (value, level) {
  var index
  var padding

  value = value.split('\n')

  index = value.length
  padding = repeat(' ', level * INDENT)

  while (index--) {
    if (value[index].length !== 0) {
      value[index] = padding + value[index]
    }
  }

  return value.join('\n')
}

/**
 * Construct a new compiler.
 *
 * @example
 *   var compiler = new Compiler(new File('> foo.'));
 *
 * @constructor
 * @class {Compiler}
 * @param {File} file - Virtual file.
 * @param {Object?} [options] - Passed to
 *   `Compiler#setOptions()`.
 */
function Compiler (file, options) {
  var self = this

  self.file = file

  self.options = extend({}, self.options)

  self.setOptions(options)
}

/*
 * Cache prototype.
 */

var compilerPrototype = Compiler.prototype

/*
 * Expose defaults.
 */

compilerPrototype.options = defaultOptions

/*
 * Expose visitors.
 */

var visitors = compilerPrototype.visitors = {}

/*
 * Map of applicable enum's.
 */

var maps = {
  'entities': ENTITY_OPTIONS,
  'bullet': LIST_BULLETS,
  'rule': THEMATIC_BREAK_BULLETS,
  'listItemIndent': LIST_ITEM_INDENTS,
  'emphasis': EMPHASIS_MARKERS,
  'strong': EMPHASIS_MARKERS,
  'fence': FENCE_MARKERS,
}

/**
 * Set options.  Does not overwrite previously set
 * options.
 *
 * @example
 *   var compiler = new Compiler();
 *   compiler.setOptions({bullet: '*'});
 *
 * @this {Compiler}
 * @throws {Error} - When an option is invalid.
 * @param {Object?} [options] - Stringify settings.
 * @return {Compiler} - `self`.
 */
compilerPrototype.setOptions = function (options) {
  var self = this
  var current = self.options
  var ruleRepetition
  var key

  if (options === null || options === undefined) {
    options = {}
  } else if (typeof options === 'object') {
    options = extend({}, options)
  } else {
    raise(options, 'options')
  }

  for (key in defaultOptions) {
    validate[typeof current[key]](
            options, key, current[key], maps[key]
        )
  }

  ruleRepetition = options.ruleRepetition

  if (ruleRepetition && ruleRepetition < MINIMUM_RULE_LENGTH) {
    raise(ruleRepetition, 'options.ruleRepetition')
  }

  self.encode = encodeFactory(String(options.entities))
  self.escape = escapeFactory(options)

  self.options = options

  return self
}

/*
 * Enter and exit helpers.
 */

compilerPrototype.enterLink = stateToggler('inLink', false)
compilerPrototype.enterTable = stateToggler('inTable', false)

/**
 * Shortcut and collapsed link references need no escaping
 * and encoding during the processing of child nodes (it
 * must be implied from identifier).
 *
 * This toggler turns encoding and escaping off for shortcut
 * and collapsed references.
 *
 * Implies `enterLink`.
 *
 * @param {Compiler} compiler - Compiler instance.
 * @param {LinkReference} node - LinkReference node.
 * @return {Function} - Exit state.
 */
compilerPrototype.enterLinkReference = function (compiler, node) {
  var encode = compiler.encode
  var escape = compiler.escape
  var exitLink = compiler.enterLink()

  if (
      node.referenceType === 'shortcut' ||
      node.referenceType === 'collapsed'
  ) {
    compiler.encode = compiler.escape = value => value
    return function () {
      compiler.encode = encode
      compiler.escape = escape
      exitLink()
    }
  } else {
    return exitLink
  }
}

/**
 * Visit a node.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.visit({
 *     type: 'strong',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *   // '**Foo**'
 *
 * @param {Object} node - Node.
 * @param {Object?} [parent] - `node`s parent.
 * @return {string} - Compiled `node`.
 */
compilerPrototype.visit = function (node, parent) {
  var self = this

  /*
   * Fail on unknown nodes.
   */

  if (typeof self.visitors[node.type] !== 'function') {
    self.file.fail(
        'Missing compiler for node of type `' +
        node.type + '`: `' + node + '`',
        node
    )
  }

  return self.visitors[node.type].call(self, node, parent)
}

/**
 * Visit all children of `parent`.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.all({
 *     type: 'strong',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     },
 *     {
 *       type: 'text',
 *       value: 'Bar'
 *     }]
 *   });
 *   // ['Foo', 'Bar']
 *
 * @param {Object} parent - Parent node of children.
 * @return {Array.<string>} - List of compiled children.
 */
compilerPrototype.all = function (parent) {
  var self = this
  var children = parent.children
  var values = []
  var index = 0
  var length = children.length
  var mergedLength = 1
  var node = children[0]
  var next

  if (length === 0) {
    return values
  }

  while (++index < length) {
    next = children[index]

    if (
        node.type === next.type &&
        node.type in MERGEABLE_NODES &&
        mergeable(node) &&
        mergeable(next)
    ) {
      node = MERGEABLE_NODES[node.type].call(self, node, next)
    } else {
      values.push(self.visit(node, parent))
      node = next
      children[mergedLength++] = node
    }
  }

  values.push(self.visit(node, parent))
  children.length = mergedLength

  return values
}

/**
 * Visit ordered list items.
 *
 * Starts the list with
 * `node.start` and increments each following list item
 * bullet by one:
 *
 *     2. foo
 *     3. bar
 *
 * In `incrementListMarker: false` mode, does not increment
 * each marker and stays on `node.start`:
 *
 *     1. foo
 *     1. bar
 *
 * Adds an extra line after an item if it has
 * `loose: true`.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.visitOrderedItems({
 *     type: 'list',
 *     ordered: true,
 *     children: [{
 *       type: 'listItem',
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   });
 *   // '1.  bar'
 *
 * @param {Object} node - `list` node with
 *   `ordered: true`.
 * @return {string} - Markdown list.
 */
compilerPrototype.visitOrderedItems = function (node) {
  var self = this
  var increment = self.options.incrementListMarker
  var values = []
  var start = node.start
  var children = node.children
  var length = children.length
  var index = -1
  var bullet
  var fn = self.visitors.listItem

  while (++index < length) {
    bullet = (increment ? start + index : start) + '.'
    values[index] = fn.call(self, children[index], node, index, bullet)
  }

  return values.join('\n')
}

/**
 * Visit unordered list items.
 *
 * Uses `options.bullet` as each item's bullet.
 *
 * Adds an extra line after an item if it has
 * `loose: true`.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.visitUnorderedItems({
 *     type: 'list',
 *     ordered: false,
 *     children: [{
 *       type: 'listItem',
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   });
 *   // '-   bar'
 *
 * @param {Object} node - `list` node with
 *   `ordered: false`.
 * @return {string} - Markdown list.
 */
compilerPrototype.visitUnorderedItems = function (node) {
  var self = this
  var values = []
  var children = node.children
  var length = children.length
  var index = -1
  var bullet = self.options.bullet
  var fn = self.visitors.listItem

  while (++index < length) {
    values[index] = fn.call(self, children[index], node, index, bullet)
  }

  return values.join('\n')
}

/**
 * Stringify a block node with block children (e.g., `root`
 * or `blockquote`).
 *
 * Knows about code following a list, or adjacent lists
 * with similar bullets, and places an extra newline
 * between them.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.block({
 *     type: 'root',
 *     children: [{
 *       type: 'paragraph',
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   });
 *   // 'bar'
 *
 * @param {Object} node - `root` node.
 * @return {string} - Markdown block content.
 */
compilerPrototype.block = function (node) {
  var self = this
  var values = []
  var children = node.children
  var length = children.length
  var index = -1
  var child
  var prev

  while (++index < length) {
    child = children[index]

    if (prev) {
      /*
       * Duplicate nodes, such as a list
       * directly following another list,
       * often need multiple new lines.
       *
       * Additionally, code blocks following a list
       * might easily be mistaken for a paragraph
       * in the list itself.
       */

      if (child.type === prev.type && prev.type === 'list') {
        values.push(prev.ordered === child.ordered ? GAP : BREAK)
      } else if (
          prev.type === 'list' &&
          child.type === 'code' &&
          !child.lang
      ) {
        values.push(GAP)
      } else {
        values.push(BREAK)
      }
    }

    values.push(self.visit(child, node))

    prev = child
  }

  return values.join('')
}

/**
 * Stringify a root.
 *
 * Adds a final newline to ensure valid POSIX files.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.root({
 *     type: 'root',
 *     children: [{
 *       type: 'paragraph',
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   });
 *   // 'bar'
 *
 * @param {Object} node - `root` node.
 * @return {string} - Markdown document.
 */
visitors.root = function (node) {
  return this.block(node) + '\n'
}

/**
 * Stringify a heading.
 *
 * In `setext: true` mode and when `depth` is smaller than
 * three, creates a setext header:
 *
 *     Foo
 *     ===
 *
 * Otherwise, an ATX header is generated:
 *
 *     ### Foo
 *
 * In `closeAtx: true` mode, the header is closed with
 * '#'es:
 *
 *     ### Foo ###
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.heading({
 *     type: 'heading',
 *     depth: 2,
 *     children: [{
 *       type: 'strong',
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   });
 *   // '## **bar**'
 *
 * @param {Object} node - `heading` node.
 * @return {string} - Markdown heading.
 */
visitors.heading = function (node) {
  var self = this
  var setext = self.options.setext
  var closeAtx = self.options.closeAtx
  var depth = node.depth
  var content = self.all(node).join('')
  var prefix

  if (setext && depth < 3) {
    return content + '\n' + repeat(depth === 1 ? '=' : '-', content.length)
  }

  prefix = repeat('#', node.depth)
  content = prefix + ' ' + content

  if (closeAtx) {
    content += ' ' + prefix
  }

  return content
}

/**
 * Stringify text.
 *
 * Supports named entities in `settings.encode: true` mode:
 *
 *     AT&amp;T
 *
 * Supports numbered entities in `settings.encode: numbers`
 * mode:
 *
 *     AT&#x26;T
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.text({
 *     type: 'text',
 *     value: 'foo'
 *   });
 *   // 'foo'
 *
 * @param {Object} node - `text` node.
 * @param {Object} parent - Parent of `node`.
 * @return {string} - Raw markdown text.
 */
visitors.text = function (node, parent) {
  return this.encode(this.escape(node.value, node, parent), node)
}

/**
 * Stringify a paragraph.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.paragraph({
 *     type: 'paragraph',
 *     children: [{
 *       type: 'strong',
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   });
 *   // '**bar**'
 *
 * @param {Object} node - `paragraph` node.
 * @return {string} - Markdown paragraph.
 */
visitors.paragraph = function (node) {
  return this.all(node).join('')
}

/**
 * Stringify a block quote.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.paragraph({
 *     type: 'blockquote',
 *     children: [{
 *       type: 'paragraph',
 *       children: [{
 *         type: 'strong',
 *         children: [{
 *           type: 'text',
 *           value: 'bar'
 *         }]
 *       }]
 *     }]
 *   });
 *   // '> **bar**'
 *
 * @param {Object} node - `blockquote` node.
 * @return {string} - Markdown block quote.
 */
visitors.blockquote = function (node) {
  var values = this.block(node).split('\n')
  var result = []
  var length = values.length
  var index = -1
  var value

  while (++index < length) {
    value = values[index]
    result[index] = (value ? ' ' : '') + value
  }

  return '>' + result.join('\n' + '>')
}

/**
 * Stringify a list. See `Compiler#visitOrderedList()` and
 * `Compiler#visitUnorderedList()` for internal working.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.visitUnorderedItems({
 *     type: 'list',
 *     ordered: false,
 *     children: [{
 *       type: 'listItem',
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   });
 *   // '-   bar'
 *
 * @param {Object} node - `list` node.
 * @return {string} - Markdown list.
 */
visitors.list = function (node) {
  return this[ORDERED_MAP[node.ordered]](node)
}

/**
 * Stringify a list item.
 *
 * Prefixes the content with a checked checkbox when
 * `checked: true`:
 *
 *     [x] foo
 *
 * Prefixes the content with an unchecked checkbox when
 * `checked: false`:
 *
 *     [ ] foo
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.listItem({
 *     type: 'listItem',
 *     checked: true,
 *     children: [{
 *       type: 'text',
 *       value: 'bar'
 *     }]
 *   }, {
 *     type: 'list',
 *     ordered: false,
 *     children: [{
 *       type: 'listItem',
 *       checked: true,
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   }, 0, '*');
 *   '-   [x] bar'
 *
 * @param {Object} node - `listItem` node.
 * @param {Object} parent - `list` node.
 * @param {number} position - Index of `node` in `parent`.
 * @param {string} bullet - Bullet to use.  This, and the
 *   `listItemIndent` setting define the used indent.
 * @return {string} - Markdown list item.
 */
visitors.listItem = function (node, parent, position, bullet) {
  var self = this
  var style = self.options.listItemIndent
  var children = node.children
  var values = []
  var index = -1
  var length = children.length
  var loose = node.loose
  var value
  var indent
  var spacing

  while (++index < length) {
    values[index] = self.visit(children[index], node)
  }

  value = CHECKBOX_MAP[node.checked] + values.join(loose ? BREAK : '\n')

  if (
      style === LIST_ITEM_ONE ||
      (style === LIST_ITEM_MIXED && value.indexOf('\n') === -1)
  ) {
    indent = bullet.length + 1
    spacing = ' '
  } else {
    indent = Math.ceil((bullet.length + 1) / INDENT) * INDENT
    spacing = repeat(' ', indent - bullet.length)
  }

  value = bullet + spacing + pad(value, indent / INDENT).slice(indent)

  if (loose && parent.children.length - 1 !== position) {
    value += '\n'
  }

  return value
}

/**
 * Stringify inline code.
 *
 * Knows about internal ticks (`\``), and ensures one more
 * tick is used to enclose the inline code:
 *
 *     ```foo ``bar`` baz```
 *
 * Even knows about inital and final ticks:
 *
 *     `` `foo ``
 *     `` foo` ``
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.inlineCode({
 *     type: 'inlineCode',
 *     value: 'foo(); `bar`; baz()'
 *   });
 *   // '``foo(); `bar`; baz()``'
 *
 * @param {Object} node - `inlineCode` node.
 * @return {string} - Markdown inline code.
 */
visitors.inlineCode = function (node) {
  var value = node.value
  var ticks = repeat('`', longestStreak(value, '`') + 1)
  var start = ticks
  var end = ticks

  if (value.charAt(0) === '`') {
    start += ' '
  }

  if (value.charAt(value.length - 1) === '`') {
    end = ' ' + end
  }

  return start + node.value + end
}

/**
 * Stringify YAML front matter.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.yaml({
 *     type: 'yaml',
 *     value: 'foo: bar'
 *   });
 *   // '---\nfoo: bar\n---'
 *
 * @param {Object} node - `yaml` node.
 * @return {string} - Markdown YAML document.
 */
visitors.yaml = function (node) {
  var delimiter = repeat('-', YAML_FENCE_LENGTH)
  var value = node.value ? '\n' + node.value : ''

  return delimiter + value + '\n' + delimiter
}

/**
 * Stringify a code block.
 *
 * Creates indented code when:
 *
 * - No language tag exists;
 * - Not in `fences: true` mode;
 * - A non-'' value exists.
 *
 * Otherwise, GFM fenced code is created:
 *
 *     ```js
 *     foo();
 *     ```
 *
 * When in ``fence: `~` `` mode, uses tildes as fences:
 *
 *     ~~~js
 *     foo();
 *     ~~~
 *
 * Knows about internal fences (Note: GitHub/Kramdown does
 * not support this):
 *
 *     ````javascript
 *     ```markdown
 *     foo
 *     ```
 *     ````
 *
 * Supports named entities in the language flag with
 * `settings.encode` mode.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.code({
 *     type: 'code',
 *     lang: 'js',
 *     value: 'fooo();'
 *   });
 *   // '```js\nfooo();\n```'
 *
 * @param {Object} node - `code` node.
 * @param {Object} parent - Parent of `node`.
 * @return {string} - Markdown code block.
 */
visitors.code = function (node, parent) {
  var self = this
  var value = node.value
  var options = self.options
  var marker = options.fence
  var language = self.encode(node.lang || '', node)
  var fence

    /*
     * Without (needed) fences.
     */

  if (!language && !options.fences && value) {
    /*
     * Throw when pedantic, in a list item which
     * isn’t compiled using a tab.
     */

    if (
        parent &&
        parent.type === 'listItem' &&
        options.listItemIndent !== LIST_ITEM_TAB &&
        options.pedantic
    ) {
      self.file.fail(ERROR_LIST_ITEM_INDENT, node.position)
    }

    return pad(value, 1)
  }

  fence = longestStreak(value, marker) + 1

    /*
     * Fix GFM / RedCarpet bug, where fence-like characters
     * inside fenced code can exit a code-block.
     * Yes, even when the outer fence uses different
     * characters, or is longer.
     * Thus, we can only pad the code to make it work.
     */

  if (FENCE.test(value)) {
    value = pad(value, 1)
  }

  fence = repeat(marker, Math.max(fence, MINIMUM_CODE_FENCE_LENGTH))

  return fence + language + '\n' + value + '\n' + fence
}

/**
 * Stringify HTML.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.html({
 *     type: 'html',
 *     value: '<div>bar</div>'
 *   });
 *   // '<div>bar</div>'
 *
 * @param {Object} node - `html` node.
 * @return {string} - Markdown HTML.
 */
visitors.html = function (node) {
  return node.value
}

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
visitors.thematicBreak = function () {
  var options = this.options
  var rule = repeat(options.rule, options.ruleRepetition)

  if (options.ruleSpaces) {
    rule = rule.split('').join(' ')
  }

  return rule
}

/**
 * Stringify a strong.
 *
 * The marker used is configurable by `strong`, which
 * defaults to an '*' (`'*'`) but also accepts an
 * underscore (`'_'`):
 *
 *     _foo_
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.strong({
 *     type: 'strong',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *   // '**Foo**'
 *
 * @param {Object} node - `strong` node.
 * @return {string} - Markdown strong-emphasised text.
 */
visitors.strong = function (node) {
  var marker = this.options.strong

  marker = marker + marker

  return marker + this.all(node).join('') + marker
}

/**
 * Stringify an emphasis.
 *
 * The marker used is configurable by `emphasis`, which
 * defaults to an underscore (`'_'`) but also accepts an
 * '*' (`'*'`):
 *
 *     *foo*
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.emphasis({
 *     type: 'emphasis',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *   // '_Foo_'
 *
 * @param {Object} node - `emphasis` node.
 * @return {string} - Markdown emphasised text.
 */
visitors.emphasis = function (node) {
  var marker = this.options.emphasis

  return marker + this.all(node).join('') + marker
}

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
visitors.break = function () {
  return this.options.commonmark ? '\\\n' : '  \n'
}

/**
 * Stringify a delete.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.delete({
 *     type: 'delete',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *   // '~~Foo~~'
 *
 * @param {Object} node - `delete` node.
 * @return {string} - Markdown strike-through.
 */
visitors.delete = function (node) {
  return DOUBLE_TILDE + this.all(node).join('') + DOUBLE_TILDE
}

/**
 * Stringify a link.
 *
 * When no title exists, the compiled `children` equal
 * `url`, and `url` starts with a protocol, an auto
 * link is created:
 *
 *     <http://example.com>
 *
 * Otherwise, is smart about enclosing `url` (see
 * `encloseURI()`) and `title` (see `encloseTitle()`).
 *
 *    [foo](<foo at bar '.' com> 'An "example" e-mail')
 *
 * Supports named entities in the `url` and `title` when
 * in `settings.encode` mode.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.link({
 *     type: 'link',
 *     url: 'http://example.com',
 *     title: 'Example Domain',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *   // '[Foo](http://example.com "Example Domain")'
 *
 * @param {Object} node - `link` node.
 * @return {string} - Markdown link.
 */
visitors.link = function (node) {
  var self = this
  var url = self.encode(node.url, node)
  var exit = self.enterLink()
  var escapedURL = self.encode(self.escape(node.url, node))
  var value = self.all(node).join('')

  exit()

  if (
      node.title === null &&
      PROTOCOL.test(url) &&
      (escapedURL === value || escapedURL === MAILTO + value)
  ) {
    /*
     * '\\' escapes do not work in autolinks,
     * so we do not escape.
     */

    return encloseURI(self.encode(node.url), true)
  }

  url = encloseURI(url)

  if (node.title) {
    url += ' ' + encloseTitle(self.encode(self.escape(node.title, node), node))
  }

  value = `[${value}]`

  value += `(${url})`

  return value
}

/**
 * Stringify a link label.
 *
 * Because link references are easily, mistakingly,
 * created (for example, `[foo]`), reference nodes have
 * an extra property depicting how it looked in the
 * original document, so stringification can cause minimal
 * changes.
 *
 * @example
 *   label({
 *     type: 'referenceImage',
 *     referenceType: 'full',
 *     identifier: 'foo'
 *   });
 *   // '[foo]'
 *
 *   label({
 *     type: 'referenceImage',
 *     referenceType: 'collapsed',
 *     identifier: 'foo'
 *   });
 *   // '[]'
 *
 *   label({
 *     type: 'referenceImage',
 *     referenceType: 'shortcut',
 *     identifier: 'foo'
 *   });
 *   // ''
 *
 * @param {Object} node - `linkReference` or
 *   `imageReference` node.
 * @return {string} - Markdown label reference.
 */
function label (node) {
  var value = ''
  var type = node.referenceType

  if (type === 'full') {
    value = node.identifier
  }

  if (type !== 'shortcut') {
    value = `[${value}]`
  }

  return value
}

/**
 * For shortcut and collapsed reference links, the contents
 * is also an identifier, so we need to restore the original
 * encoding and escaping that were present in the source
 * string.
 *
 * This function takes the unescaped & unencoded value from
 * shortcut's child nodes and the identifier and encodes
 * the former according to the latter.
 *
 * @example
 *   copyIdentifierEncoding('a*b', 'a\\*b*c')
 *   // 'a\\*b*c'
 *
 * @param {string} value - Unescaped and unencoded stringified
 *   link value.
 * @param {string} identifier - Link identifier.
 * @return {string} - Encoded link value.
 */
function copyIdentifierEncoding (value, identifier) {
  var index = 0
  var position = 0
  var length = value.length
  var count = identifier.length
  var result = []
  var start

  while (index < length) {
    /*
     * Take next non-punctuation characters from `value`.
     */

    start = index

    while (
        index < length &&
        !PUNCTUATION.test(value.charAt(index))
    ) {
      index += 1
    }

    result.push(value.slice(start, index))

    /*
     * Advance `position` to the next punctuation character.
     */
    while (
        position < count &&
        !PUNCTUATION.test(identifier.charAt(position))
    ) {
      position += 1
    }

    /*
     * Take next punctuation characters from `identifier`.
     */
    start = position

    while (
        position < count &&
        PUNCTUATION.test(identifier.charAt(position))
    ) {
      if (identifier.charAt(position) === '&') {
        position += entityPrefixLength(identifier.slice(position))
      }
      position += 1
    }

    result.push(identifier.slice(start, position))

    /*
     * Advance `index` to the next non-punctuation character.
     */
    while (index < length && PUNCTUATION.test(value.charAt(index))) {
      index += 1
    }
  }

  return result.join('')
}

/**
 * Stringify a link reference.
 *
 * See `label()` on how reference labels are created.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.linkReference({
 *     type: 'linkReference',
 *     referenceType: 'collapsed',
 *     identifier: 'foo',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *   // '[Foo][]'
 *
 * @param {Object} node - `linkReference` node.
 * @return {string} - Markdown link reference.
 */
visitors.linkReference = function (node) {
  var self = this
  var exitLinkReference = self.enterLinkReference(self, node)
  var value = self.all(node).join('')

  exitLinkReference()

  if (
      node.referenceType === 'shortcut' ||
      node.referenceType === 'collapsed'
  ) {
    value = copyIdentifierEncoding(value, node.identifier)
  }

  return `[${value}]` + label(node)
}

/**
 * Stringify an image reference.
 *
 * See `label()` on how reference labels are created.
 *
 * Supports named entities in the `alt` when
 * in `settings.encode` mode.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.imageReference({
 *     type: 'imageReference',
 *     referenceType: 'full',
 *     identifier: 'foo',
 *     alt: 'Foo'
 *   });
 *   // '![Foo][foo]'
 *
 * @param {Object} node - `imageReference` node.
 * @return {string} - Markdown image reference.
 */
visitors.imageReference = function (node) {
  var alt = this.encode(node.alt, node) || ''

  return `![${alt}]${label(node)}`
}

/**
 * Stringify a footnote reference.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.footnoteReference({
 *     type: 'footnoteReference',
 *     identifier: 'foo'
 *   });
 *   // '[^foo]'
 *
 * @param {Object} node - `footnoteReference` node.
 * @return {string} - Markdown footnote reference.
 */
visitors.footnoteReference = function (node) {
  return `[^${node.identifier}]`
}

/**
 * Stringify a link- or image definition.
 *
 * Is smart about enclosing `url` (see `encloseURI()`) and
 * `title` (see `encloseTitle()`).
 *
 *    [foo]: <foo at bar '.' com> 'An "example" e-mail'
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.definition({
 *     type: 'definition',
 *     url: 'http://example.com',
 *     title: 'Example Domain',
 *     identifier: 'foo'
 *   });
 *   // '[foo]: http://example.com "Example Domain"'
 *
 * @param {Object} node - `definition` node.
 * @return {string} - Markdown link- or image definition.
 */
visitors.definition = function (node) {
  var value = `[${node.identifier}]`
  var url = encloseURI(node.url)

  if (node.title) {
    url += ' ' + encloseTitle(node.title)
  }

  return value + ': ' + url
}

/**
 * Stringify an image.
 *
 * Is smart about enclosing `url` (see `encloseURI()`) and
 * `title` (see `encloseTitle()`).
 *
 *    ![foo](</fav icon.png> 'My "favourite" icon')
 *
 * Supports named entities in `url`, `alt`, and `title`
 * when in `settings.encode` mode.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.image({
 *     type: 'image',
 *     url: 'http://example.png/favicon.png',
 *     title: 'Example Icon',
 *     alt: 'Foo'
 *   });
 *   // '![Foo](http://example.png/favicon.png "Example Icon")'
 *
 * @param {Object} node - `image` node.
 * @return {string} - Markdown image.
 */
visitors.image = function (node) {
  var url = encloseURI(this.encode(node.url, node))
  var value

  if (node.title) {
    url += ' ' + encloseTitle(this.encode(node.title, node))
  }

  value = '![' + this.encode(node.alt || '', node) + ']'

  value += '(' + url + ')'

  return value
}

/**
 * Stringify a footnote.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.footnote({
 *     type: 'footnote',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *   // '[^Foo]'
 *
 * @param {Object} node - `footnote` node.
 * @return {string} - Markdown footnote.
 */
visitors.footnote = function (node) {
  return '[^' + this.all(node).join('') + ']'
}

/**
 * Stringify a footnote definition.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.footnoteDefinition({
 *     type: 'footnoteDefinition',
 *     identifier: 'foo',
 *     children: [{
 *       type: 'paragraph',
 *       children: [{
 *         type: 'text',
 *         value: 'bar'
 *       }]
 *     }]
 *   });
 *   // '[^foo]: bar'
 *
 * @param {Object} node - `footnoteDefinition` node.
 * @return {string} - Markdown footnote definition.
 */
visitors.footnoteDefinition = function (node) {
  var id = node.identifier.toLowerCase()

  return `[^${id}]: ${this.all(node).join(BREAK + repeat(' ', INDENT))}`
}

/**
 * Stringify table.
 *
 * Creates a fenced table by default, but not in
 * `looseTable: true` mode:
 *
 *     Foo | Bar
 *     :-: | ---
 *     Baz | Qux
 *
 * NOTE: Be careful with `looseTable: true` mode, as a
 * loose table inside an indented code block on GitHub
 * renders as an actual table!
 *
 * Creates a spaces table by default, but not in
 * `spacedTable: false`:
 *
 *     |Foo|Bar|
 *     |:-:|---|
 *     |Baz|Qux|
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.table({
 *     type: 'table',
 *     align: ['center', null],
 *     children: [
 *       {
 *         type: 'tableRow',
 *         children: [
 *           {
 *             type: 'tableCell'
 *             children: [{
 *               type: 'text'
 *               value: 'Foo'
 *             }]
 *           },
 *           {
 *             type: 'tableCell'
 *             children: [{
 *               type: 'text'
 *               value: 'Bar'
 *             }]
 *           }
 *         ]
 *       },
 *       {
 *         type: 'tableRow',
 *         children: [
 *           {
 *             type: 'tableCell'
 *             children: [{
 *               type: 'text'
 *               value: 'Baz'
 *             }]
 *           },
 *           {
 *             type: 'tableCell'
 *             children: [{
 *               type: 'text'
 *               value: 'Qux'
 *             }]
 *           }
 *         ]
 *       }
 *     ]
 *   });
 *   // '| Foo | Bar |\n| :-: | --- |\n| Baz | Qux |'
 *
 * @param {Object} node - `table` node.
 * @return {string} - Markdown table.
 */
visitors.table = function (node) {
  var self = this
  var loose = self.options.looseTable
  var spaced = self.options.spacedTable
  var rows = node.children
  var index = rows.length
  var exit = self.enterTable()
  var result = []
  var start

  while (index--) {
    result[index] = self.all(rows[index])
  }

  exit()

  start = loose ? '' : spaced ? '| ' : '|'

  return table(result, {
    'align': node.align,
    'start': start,
    'end': start.split('').reverse().join(''),
    'delimiter': spaced ? ' | ' : '|',
  })
}

/**
 * Stringify a table cell.
 *
 * @example
 *   var compiler = new Compiler();
 *
 *   compiler.tableCell({
 *     type: 'tableCell',
 *     children: [{
 *       type: 'text'
 *       value: 'Qux'
 *     }]
 *   });
 *   // 'Qux'
 *
 * @param {Object} node - `tableCell` node.
 * @return {string} - Markdown table cell.
 */
visitors.tableCell = function (node) {
  return this.all(node).join('')
}

/**
 * Stringify the bound file.
 *
 * @example
 *   var file = new VFile('__Foo__');
 *
 *   file.namespace('mdast').tree = {
 *     type: 'strong',
 *     children: [{
 *       type: 'text',
 *       value: 'Foo'
 *     }]
 *   });
 *
 *   new Compiler(file).compile();
 *   // '**Foo**'
 *
 * @this {Compiler}
 * @return {string} - Markdown document.
 */
compilerPrototype.compile = function () {
  return this.visit(this.file.namespace('mdast').tree)
}

/*
 * Expose `stringify` on `module.exports`.
 */

module.exports = Compiler
