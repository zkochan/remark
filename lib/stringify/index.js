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

var extend = require('extend')
var utilities = require('../utilities.js')
var defaultOptions = require('../defaults.js').stringify
const encodeFactory = require('./encode-factory')
const escapeFactory = require('./escape-factory')
const LIST_BULLETS = require('./list-bullets')

/*
 * Methods.
 */

var raise = utilities.raise
var validate = utilities.validate
var mergeable = utilities.mergeable
var MERGEABLE_NODES = utilities.MERGEABLE_NODES

/**
 * Construct a state `toggler`: a function which inverses
 * `property` in context based on its current value.
 * The by `toggler` returned function restores that value.
 *
 * @example
 *   var context = {};
 *   var key = 'foo';
 *   var val = true;
 *   context[key] = val;
 *   context.enter = stateToggler(key, val);
 *   context[key]; // true
 *   var exit = context.enter();
 *   context[key]; // false
 *   var nested = context.enter();
 *   context[key]; // false
 *   nested();
 *   context[key]; // false
 *   exit();
 *   context[key]; // true
 *
 * @param {string} key - Property to toggle.
 * @param {boolean} state - It's default state.
 * @return {function(): function()} - Enter.
 */
function stateToggler (key, state) {
  /**
   * Construct a toggler for the bound `key`.
   *
   * @return {Function} - Exit state.
   */
  function enter () {
    var self = this
    var current = self[key]

    self[key] = !state

    /**
     * State canceler, cancels the state, if allowed.
     */
    function exit () {
      self[key] = current
    }

    return exit
  }

  return enter
}

/*
 * Constants.
 */

var MINIMUM_RULE_LENGTH = 3

/*
 * Character combinations.
 */

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
 * Allowed list-item-indent's.
 */

var LIST_ITEM_INDENTS = {}

var LIST_ITEM_TAB = 'tab'
var LIST_ITEM_ONE = '1'
var LIST_ITEM_MIXED = 'mixed'

LIST_ITEM_INDENTS[LIST_ITEM_ONE] = true
LIST_ITEM_INDENTS[LIST_ITEM_TAB] = true
LIST_ITEM_INDENTS[LIST_ITEM_MIXED] = true

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
function Compiler (file, options, processor) {
  var self = this

  self.file = file

  self.options = extend({}, self.options)

  self.setOptions(options)

  self.visitors = processor.visitors
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

  return self.visitors[node.type](self, node, parent)
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
