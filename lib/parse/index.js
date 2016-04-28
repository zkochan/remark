/**
 * @author Titus Wormer
 * @copyright 2015-2016 Titus Wormer
 * @license MIT
 * @module remark:parse
 * @version 4.2.1
 * @fileoverview Parse a markdown document into an
 *   abstract syntax tree.
 */

'use strict';

/* eslint-env commonjs */

/*
 * Dependencies.
 */

var decode = require('parse-entities');
var repeat = require('repeat-string');
var trim = require('trim');
var extend = require('extend');
var vfileLocation = require('vfile-location');
var removePosition = require('unist-util-remove-position');
var utilities = require('../utilities.js');
var defaultOptions = require('../defaults.js').parse;
var blockElements = require('./block-elements.json');
var isWhiteSpace = require('./is-white-space');
var isAlphabetic = require('./is-alphabetic')
var isNumeric = require('./is-numeric')
var eatHTMLComment = require('./eat/html-comment')
var eatHTMLCDATA = require('./eat/html-cdata')
var eatHTMLProcessingInstruction = require('./eat/html-processing-instructions')
var eatHTMLDeclaration = require('./eat/html-declaration')
var eatHTMLClosingTag = require('./eat/html-closing-tag')
var eatHTMLOpeningTag = require('./eat/html-opening-tag')

/*
 * Methods.
 */

var raise = utilities.raise;
var clean = utilities.clean;
var validate = utilities.validate;
var normalize = utilities.normalizeIdentifier;
var stateToggler = utilities.stateToggler;
var mergeable = utilities.mergeable;
var MERGEABLE_NODES = utilities.MERGEABLE_NODES;

/*
 * Numeric constants.
 */

var SPACE_SIZE = 1;
var TAB_SIZE = 4;

/*
 * Error messages.
 */

var ERR_INFINITE_LOOP = 'Infinite loop';
var ERR_INCORRECTLY_EATEN = 'Incorrectly eaten value: please report this ' +
    'warning on http://git.io/vg5Ft';

/*
 * Expressions.
 */

var EXPRESSION_BULLET = /^([ \t]*)([*+-]|\d+[.)])( {1,4}(?! )| |\t|$|(?=\n))([^\n]*)/;
var EXPRESSION_PEDANTIC_BULLET = /^([ \t]*)([*+-]|\d+[.)])([ \t]+)/;
var EXPRESSION_INITIAL_INDENT = /^( {1,4}|\t)?/gm;
var EXPRESSION_LOOSE_LIST_ITEM = /\n\n(?!\s*$)/;
var EXPRESSION_TASK_ITEM = /^\[([\ \t]|x|X)\][\ \t]/;

/*
 * Textual constants.
 */

var BLOCK = 'block';
var INLINE = 'inline';

const nodeTypes = require('./node-types')

/*
 * A map of characters, and their column length,
 * which can be used as indentation.
 */

var INDENTATION_CHARACTERS = {};

INDENTATION_CHARACTERS[' '] = SPACE_SIZE;
INDENTATION_CHARACTERS['\t'] = TAB_SIZE;

/*
 * A map of characters, which can be used to mark emphasis.
 */

var EMPHASIS_MARKERS = {};

EMPHASIS_MARKERS['*'] = true;
EMPHASIS_MARKERS['_'] = true;

/*
 * A map of characters, which can be used to mark rules.
 */

var RULE_MARKERS = {};

RULE_MARKERS['*'] = true;
RULE_MARKERS['_'] = true;
RULE_MARKERS['-'] = true;

/*
 * A map of two functions which can create list items.
 */

var LIST_ITEM_MAP = {};

LIST_ITEM_MAP.true = renderPedanticListItem;
LIST_ITEM_MAP.false = renderNormalListItem;

/**
 * Factory to create an entity decoder.
 *
 * @param {Object} context - Context to attach to, e.g.,
 *   a parser.
 * @return {Function} - See `decode`.
 */
function decodeFactory(context) {
    /**
     * Normalize `position` to add an `indent`.
     *
     * @param {Position} position - Reference
     * @return {Position} - Augmented with `indent`.
     */
    function normalize(position) {
        return {
            'start': position,
            'indent': context.getIndent(position.line)
        };
    }

    /**
     * Handle a warning.
     *
     * @this {VFile} - Virtual file.
     * @param {string} reason - Reason for warning.
     * @param {Position} position - Place of warning.
     * @param {number} code - Code for warning.
     */
    function handleWarning(reason, position, code) {
        if (code === 3) {
            return;
        }

        context.file.warn(reason, position);
    }

    /**
     * Decode `value` (at `position`) into text-nodes.
     *
     * @param {string} value - Value to parse.
     * @param {Position} position - Position to start parsing at.
     * @param {Function} handler - Node handler.
     */
    function decoder(value, position, handler) {
        decode(value, {
            'position': normalize(position),
            'warning': handleWarning,
            'text': handler,
            'reference': handler,
            'textContext': context,
            'referenceContext': context
        });
    }

    /**
     * Decode `value` (at `position`) into a string.
     *
     * @param {string} value - Value to parse.
     * @param {Position} position - Position to start
     *   parsing at.
     * @return {string} - Plain-text.
     */
    function decodeRaw(value, position) {
        return decode(value, {
            'position': normalize(position),
            'warning': handleWarning
        });
    }

    decoder.raw = decodeRaw;

    return decoder;
}

/**
 * Factory to de-escape a value, based on a list at `key`
 * in `scope`.
 *
 * @example
 *   var scope = {escape: ['a']}
 *   var descape = descapeFactory(scope, 'escape');
 *
 * @param {Object} scope - List of escapable characters.
 * @param {string} key - Key in `map` at which the list
 *   exists.
 * @return {function(string): string} - Function which
 *   takes a value and returns its unescaped version.
 */
function descapeFactory(scope, key) {
    /**
     * De-escape a string using the expression at `key`
     * in `scope`.
     *
     * @example
     *   var scope = {escape: ['a']}
     *   var descape = descapeFactory(scope, 'escape');
     *   descape('\a \b'); // 'a \b'
     *
     * @param {string} value - Escaped string.
     * @return {string} - Unescaped string.
     */
    function descape(value) {
        var prev = 0;
        var index = value.indexOf('\\');
        var escape = scope[key];
        var queue = [];
        var character;

        while (index !== -1) {
            queue.push(value.slice(prev, index));
            prev = index + 1;
            character = value.charAt(prev);

            /*
             * If the following character is not a valid escape,
             * add the slash.
             */

            if (!character || escape.indexOf(character) === -1) {
                queue.push('\\');
            }

            index = value.indexOf('\\', prev);
        }

        queue.push(value.slice(prev));

        return queue.join('');
    }

    return descape;
}

/**
 * Gets indentation information for a line.
 *
 * @example
 *   getIndent('  foo');
 *   // {indent: 2, stops: {1: 0, 2: 1}}
 *
 *   getIndent('\tfoo');
 *   // {indent: 4, stops: {4: 0}}
 *
 *   getIndent('  \tfoo');
 *   // {indent: 4, stops: {1: 0, 2: 1, 4: 2}}
 *
 *   getIndent('\t  foo')
 *   // {indent: 6, stops: {4: 0, 5: 1, 6: 2}}
 *
 * @param {string} value - Indented line.
 * @return {Object} - Indetation information.
 */
function getIndent(value) {
    var index = 0;
    var indent = 0;
    var character = value.charAt(index);
    var stops = {};
    var size;

    while (character in INDENTATION_CHARACTERS) {
        size = INDENTATION_CHARACTERS[character];

        indent += size;

        if (size > 1) {
            indent = Math.floor(indent / size) * size;
        }

        stops[indent] = index;

        character = value.charAt(++index);
    }

    return {
        'indent': indent,
        'stops': stops
    };
}

/**
 * Remove the minimum indent from every line in `value`.
 * Supports both tab, spaced, and mixed indentation (as
 * well as possible).
 *
 * @example
 *   removeIndentation('  foo'); // 'foo'
 *   removeIndentation('    foo', 2); // '  foo'
 *   removeIndentation('\tfoo', 2); // '  foo'
 *   removeIndentation('  foo\n bar'); // ' foo\n bar'
 *
 * @param {string} value - Value to trim.
 * @param {number?} [maximum] - Maximum indentation
 *   to remove.
 * @return {string} - Unindented `value`.
 */
function removeIndentation(value, maximum) {
    var values = value.split('\n');
    var position = values.length + 1;
    var minIndent = Infinity;
    var matrix = [];
    var index;
    var indentation;
    var stops;
    var padding;

    values.unshift(repeat(' ', maximum) + '!');

    while (position--) {
        indentation = getIndent(values[position]);

        matrix[position] = indentation.stops;

        if (trim(values[position]).length === 0) {
            continue;
        }

        if (indentation.indent) {
            if (indentation.indent > 0 && indentation.indent < minIndent) {
                minIndent = indentation.indent;
            }
        } else {
            minIndent = Infinity;

            break;
        }
    }

    if (minIndent !== Infinity) {
        position = values.length;

        while (position--) {
            stops = matrix[position];
            index = minIndent;

            while (index && !(index in stops)) {
                index--;
            }

            if (
                trim(values[position]).length !== 0 &&
                minIndent &&
                index !== minIndent
            ) {
                padding = '\t';
            } else {
                padding = '';
            }

            values[position] = padding + values[position].slice(
                index in stops ? stops[index] + 1 : 0
            );
        }
    }

    values.shift();

    return values.join('\n');
}

/**
 * Create a list-item using overly simple mechanics.
 *
 * @example
 *   renderPedanticListItem('- _foo_', now());
 *
 * @param {string} value - List-item.
 * @param {Object} position - List-item location.
 * @return {string} - Cleaned `value`.
 */
function renderPedanticListItem(value, position) {
    var self = this;
    var indent = self.indent(position.line);

    /**
     * A simple replacer which removed all matches,
     * and adds their length to `offset`.
     *
     * @param {string} $0 - Indentation to subtract.
     * @return {string} - An empty string.
     */
    function replacer($0) {
        indent($0.length);

        return '';
    }

    /*
     * Remove the list-item’s bullet.
     */

    value = value.replace(EXPRESSION_PEDANTIC_BULLET, replacer);

    /*
     * The initial line was also matched by the below, so
     * we reset the `line`.
     */

    indent = self.indent(position.line);

    return value.replace(EXPRESSION_INITIAL_INDENT, replacer);
}

/**
 * Create a list-item using sane mechanics.
 *
 * @example
 *   renderNormalListItem('- _foo_', now());
 *
 * @param {string} value - List-item.
 * @param {Object} position - List-item location.
 * @return {string} - Cleaned `value`.
 */
function renderNormalListItem(value, position) {
    var self = this;
    var indent = self.indent(position.line);
    var max;
    var bullet;
    var rest;
    var lines;
    var trimmedLines;
    var index;
    var length;

    /*
     * Remove the list-item’s bullet.
     */

    value = value.replace(EXPRESSION_BULLET, function ($0, $1, $2, $3, $4) {
        bullet = $1 + $2 + $3;
        rest = $4;

        /*
         * Make sure that the first nine numbered list items
         * can indent with an extra space.  That is, when
         * the bullet did not receive an extra final space.
         */

        if (Number($2) < 10 && bullet.length % 2 === 1) {
            $2 = ' ' + $2;
        }

        max = $1 + repeat(' ', $2.length) + $3;

        return max + rest;
    });

    lines = value.split('\n');

    trimmedLines = removeIndentation(
        value, getIndent(max).indent
    ).split('\n');

    /*
     * We replaced the initial bullet with something
     * else above, which was used to trick
     * `removeIndentation` into removing some more
     * characters when possible. However, that could
     * result in the initial line to be stripped more
     * than it should be.
     */

    trimmedLines[0] = rest;

    indent(bullet.length);

    index = 0;
    length = lines.length;

    while (++index < length) {
        indent(lines[index].length - trimmedLines[index].length);
    }

    return trimmedLines.join('\n');
}

/**
 * Create a list-item node.
 *
 * @example
 *   renderListItem('- _foo_', now());
 *
 * @param {Object} value - List-item.
 * @param {Object} position - List-item location.
 * @return {Object} - `listItem` node.
 */
function renderListItem(value, position) {
    var self = this;
    var checked = null;
    var node;
    var task;
    var indent;

    value = LIST_ITEM_MAP[self.options.pedantic].apply(self, arguments);

    if (self.options.gfm) {
        task = value.match(EXPRESSION_TASK_ITEM);

        if (task) {
            indent = task[0].length;
            checked = task[1].toLowerCase() === 'x';

            self.indent(position.line)(indent);
            value = value.slice(indent);
        }
    }

    node = {
        'type': nodeTypes.LIST_ITEM,
        'loose': EXPRESSION_LOOSE_LIST_ITEM.test(value) ||
            value.charAt(value.length - 1) === '\n',
        'checked': checked
    };

    node.children = self.tokenizeBlock(value, position);

    return node;
}

/**
 * Create a footnote-definition node.
 *
 * @example
 *   renderFootnoteDefinition('1', '_foo_', now());
 *
 * @param {string} identifier - Unique reference.
 * @param {string} value - Contents
 * @param {Object} position - Definition location.
 * @return {Object} - `footnoteDefinition` node.
 */
function renderFootnoteDefinition(identifier, value, position) {
    var self = this;
    var exitBlockquote = self.enterBlockquote();
    var node;

    node = {
        'type': nodeTypes.FOOTNOTE_DEFINITION,
        'identifier': identifier,
        'children': self.tokenizeBlock(value, position)
    };

    exitBlockquote();

    return node;
}

/**
 * Create a heading node.
 *
 * @example
 *   renderHeading('_foo_', 1, now());
 *
 * @param {string} value - Content.
 * @param {number} depth - Heading depth.
 * @param {Object} position - Heading content location.
 * @return {Object} - `heading` node
 */
function renderHeading(value, depth, position) {
    return {
        'type': nodeTypes.HEADING,
        'depth': depth,
        'children': this.tokenizeInline(value, position)
    };
}

/**
 * Create a blockquote node.
 *
 * @example
 *   renderBlockquote('_foo_', eat);
 *
 * @param {string} value - Content.
 * @param {Object} now - Position.
 * @return {Object} - `blockquote` node.
 */
function renderBlockquote(value, now) {
    var self = this;
    var exitBlockquote = self.enterBlockquote();
    var node = {
        'type': nodeTypes.BLOCKQUOTE,
        'children': self.tokenizeBlock(value, now)
    };

    exitBlockquote();

    return node;
}

/**
 * Create a parent.
 *
 * @example
 *   renderParent('paragraph', '_foo_');
 *
 * @param {string} type - Node type.
 * @param {Array.<Object>} children - Child nodes.
 * @return {Object} - Node of type `type`.
 */
function renderParent(type, children) {
    return {
        'type': type,
        'children': children
    };
}

/**
 * Create a link node.
 *
 * @example
 *   renderLink(true, 'example.com', 'example', 'Example Domain', now(), eat);
 *   renderLink(false, 'fav.ico', 'example', 'Example Domain', now(), eat);
 *
 * @param {boolean} isLink - Whether linking to a document
 *   or an image.
 * @param {string} url - URI reference.
 * @param {string} text - Content.
 * @param {string?} title - Title.
 * @param {Object} position - Location of link.
 * @return {Object} - `link` or `image` node.
 */
function renderLink(isLink, url, text, title, position) {
    var self = this;
    var exitLink = self.enterLink();
    var node;

    node = {
        'type': isLink ? nodeTypes.LINK : nodeTypes.IMAGE,
        'title': title || null
    };

    if (isLink) {
        node.url = url;
        node.children = self.tokenizeInline(text, position);
    } else {
        node.url = url;
        node.alt = text ?
            self.decode.raw(self.descape(text), position) :
            null;
    }

    exitLink();

    return node;
}

/**
 * Create a footnote node.
 *
 * @example
 *   renderFootnote('_foo_', now());
 *
 * @param {string} value - Contents.
 * @param {Object} position - Location of footnote.
 * @return {Object} - `footnote` node.
 */
function renderFootnote(value, position) {
    return this.renderInline(nodeTypes.FOOTNOTE, value, position);
}

/**
 * Add a node with inline content.
 *
 * @example
 *   renderInline('strong', '_foo_', now());
 *
 * @param {string} type - Node type.
 * @param {string} value - Contents.
 * @param {Object} position - Location of node.
 * @return {Object} - Node of type `type`.
 */
function renderInline(type, value, position) {
    return this.renderParent(type, this.tokenizeInline(value, position));
}

/**
 * Add a node with block content.
 *
 * @example
 *   renderBlock('blockquote', 'Foo.', now());
 *
 * @param {string} type - Node type.
 * @param {string} value - Contents.
 * @param {Object} position - Location of node.
 * @return {Object} - Node of type `type`.
 */
function renderBlock(type, value, position) {
    return this.renderParent(type, this.tokenizeBlock(value, position));
}

/**
 * Construct a new parser.
 *
 * @example
 *   var parser = new Parser(new VFile('Foo'));
 *
 * @constructor
 * @class {Parser}
 * @param {VFile} file - File to parse.
 * @param {Object?} [options] - Passed to
 *   `Parser#setOptions()`.
 */
function Parser(file, options, processor) {
    var self = this;

    self.file = file;
    self.inLink = false;
    self.atTop = true;
    self.atStart = true;
    self.inBlockquote = false;
    self.data = processor.data;
    self.toOffset = vfileLocation(file).toOffset;

    self.descape = descapeFactory(self, 'escape');
    self.decode = decodeFactory(self);

    self.options = extend({}, self.options);

    self.setOptions(options);
}

/**
 * Set options.  Does not overwrite previously set
 * options.
 *
 * @example
 *   var parser = new Parser();
 *   parser.setOptions({gfm: true});
 *
 * @this {Parser}
 * @throws {Error} - When an option is invalid.
 * @param {Object?} [options] - Parse settings.
 * @return {Parser} - `self`.
 */
Parser.prototype.setOptions = function (options) {
    var self = this;
    var escape = self.data.escape;
    var current = self.options;
    var key;

    if (options === null || options === undefined) {
        options = {};
    } else if (typeof options === 'object') {
        options = extend({}, options);
    } else {
        raise(options, 'options');
    }

    for (key in defaultOptions) {
        validate.boolean(options, key, current[key]);
    }

    self.options = options;

    if (options.commonmark) {
        self.escape = escape.commonmark;
    } else if (options.gfm) {
        self.escape = escape.gfm;
    } else {
        self.escape = escape.default;
    }

    return self;
};

/*
 * Expose `defaults`.
 */

Parser.prototype.options = defaultOptions;

/**
 * Factory to track indentation for each line corresponding
 * to the given `start` and the number of invocations.
 *
 * @param {number} start - Starting line.
 * @return {function(offset)} - Indenter.
 */
Parser.prototype.indent = function (start) {
    var self = this;
    var line = start;

    /**
     * Intender which increments the global offset,
     * starting at the bound line, and further incrementing
     * each line for each invocation.
     *
     * @example
     *   indenter(2);
     *
     * @param {number} offset - Number to increment the
     *   offset.
     */
    function indenter(offset) {
        self.offset[line] = (self.offset[line] || 0) + offset;

        line++;
    }

    return indenter;
};

/**
 * Get found offsets starting at `start`.
 *
 * @param {number} start - Starting line.
 * @return {Array.<number>} - Offsets starting at `start`.
 */
Parser.prototype.getIndent = function (start) {
    var offset = this.offset;
    var result = [];

    while (++start) {
        if (!(start in offset)) {
            break;
        }

        result.push((offset[start] || 0) + 1);
    }

    return result;
};

/**
 * Parse the bound file.
 *
 * @example
 *   new Parser(new File('_Foo_.')).parse();
 *
 * @this {Parser}
 * @return {Object} - `root` node.
 */
Parser.prototype.parse = function () {
    var self = this;
    var value = clean(String(self.file));
    var node;

    /*
     * Add an `offset` matrix, used to keep track of
     * syntax and white space indentation per line.
     */

    self.offset = {};

    node = self.renderBlock(nodeTypes.ROOT, value);

    node.position = {
        'start': {
            'line': 1,
            'column': 1,
            'offset': 0
        }
    };

    node.position.end = self.eof || extend({}, node.position.start);

    if (!self.options.position) {
        removePosition(node);
    }

    return node;
};

/*
 * Enter and exit helpers.
 */

Parser.prototype.enterLink = stateToggler('inLink', false);
Parser.prototype.exitTop = stateToggler('atTop', true);
Parser.prototype.exitStart = stateToggler('atStart', true);
Parser.prototype.enterBlockquote = stateToggler('inBlockquote', false);

/*
 * Expose helpers
 */

Parser.prototype.renderParent = renderParent;
Parser.prototype.renderInline = renderInline;
Parser.prototype.renderBlock = renderBlock;

Parser.prototype.renderLink = renderLink;
Parser.prototype.renderBlockquote = renderBlockquote;
Parser.prototype.renderListItem = renderListItem;
Parser.prototype.renderFootnoteDefinition = renderFootnoteDefinition;
Parser.prototype.renderHeading = renderHeading;
Parser.prototype.renderFootnote = renderFootnote;

/**
 * Construct a tokenizer.  This creates both
 * `tokenizeInline` and `tokenizeBlock`.
 *
 * @example
 *   Parser.prototype.tokenizeInline = tokenizeFactory('inline');
 *
 * @param {string} type - Name of parser, used to find
 *   its expressions (`%sMethods`) and tokenizers
 *   (`%Tokenizers`).
 * @return {Function} - Tokenizer.
 */
function tokenizeFactory(type) {
    /**
     * Tokenizer for a bound `type`
     *
     * @example
     *   parser = new Parser();
     *   parser.tokenizeInline('_foo_');
     *
     * @param {string} value - Content.
     * @param {Object?} [location] - Offset at which `value`
     *   starts.
     * @return {Array.<Object>} - Nodes.
     */
    function tokenize(value, location) {
        var self = this;
        var offset = self.offset;
        var tokens = [];
        var methods = self[type + 'Methods'];
        var tokenizers = self[type + 'Tokenizers'];
        var line = location ? location.line : 1;
        var column = location ? location.column : 1;
        var add;
        var index;
        var length;
        var method;
        var name;
        var matched;
        var valueLength;

        /*
         * Trim white space only lines.
         */

        if (!value) {
            return tokens;
        }

        /**
         * Update line, column, and offset based on
         * `value`.
         *
         * @example
         *   updatePosition('foo');
         *
         * @param {string} subvalue - Subvalue to eat.
         */
        function updatePosition(subvalue) {
            var lastIndex = -1;
            var index = subvalue.indexOf('\n');

            while (index !== -1) {
                line++;
                lastIndex = index;
                index = subvalue.indexOf('\n', index + 1);
            }

            if (lastIndex === -1) {
                column += subvalue.length;
            } else {
                column = subvalue.length - lastIndex;
            }

            if (line in offset) {
                if (lastIndex !== -1) {
                    column += offset[line];
                } else if (column <= offset[line]) {
                    column = offset[line] + 1;
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
        function getOffset() {
            var indentation = [];
            var pos = line + 1;

            /**
             * Done. Called when the last character is
             * eaten to retrieve the range’s offsets.
             *
             * @return {Array.<number>} - Offset.
             */
            function done() {
                var last = line + 1;

                while (pos < last) {
                    indentation.push((offset[pos] || 0) + 1);

                    pos++;
                }

                return indentation;
            }

            return done;
        }

        /**
         * Get the current position.
         *
         * @example
         *   position = now(); // {line: 1, column: 1, offset: 0}
         *
         * @return {Object} - Current Position.
         */
        function now() {
            var pos = {
                'line': line,
                'column': column
            };

            pos.offset = self.toOffset(pos);

            return pos;
        }

        /**
         * Store position information for a node.
         *
         * @example
         *   start = now();
         *   updatePosition('foo');
         *   location = new Position(start);
         *   // {
         *   //   start: {line: 1, column: 1, offset: 0},
         *   //   end: {line: 1, column: 3, offset: 2}
         *   // }
         *
         * @param {Object} start - Starting position.
         */
        function Position(start) {
            this.start = start;
            this.end = now();
        }

        /**
         * Throw when a value is incorrectly eaten.
         * This shouldn’t happen but will throw on new,
         * incorrect rules.
         *
         * @example
         *   // When the current value is set to `foo bar`.
         *   validateEat('foo');
         *   eat('foo');
         *
         *   validateEat('bar');
         *   // throws, because the space is not eaten.
         *
         * @param {string} subvalue - Value to be eaten.
         * @throws {Error} - When `subvalue` cannot be eaten.
         */
        function validateEat(subvalue) {
            /* istanbul ignore if */
            if (value.substring(0, subvalue.length) !== subvalue) {
                self.file.fail(ERR_INCORRECTLY_EATEN, now());
            }
        }

        /**
         * Mark position and patch `node.position`.
         *
         * @example
         *   var update = position();
         *   updatePosition('foo');
         *   update({});
         *   // {
         *   //   position: {
         *   //     start: {line: 1, column: 1, offset: 0},
         *   //     end: {line: 1, column: 3, offset: 2}
         *   //   }
         *   // }
         *
         * @returns {Function} - Updater.
         */
        function position() {
            var before = now();

            /**
             * Add the position to a node.
             *
             * @example
             *   update({type: 'text', value: 'foo'});
             *
             * @param {Node} node - Node to attach position
             *   on.
             * @param {Array} [indent] - Indentation for
             *   `node`.
             * @return {Node} - `node`.
             */
            function update(node, indent) {
                var prev = node.position;
                var start = prev ? prev.start : before;
                var combined = [];
                var n = prev && prev.end.line;
                var l = before.line;

                node.position = new Position(start);

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
                    combined = prev.indent;

                    if (n < l) {
                        while (++n < l) {
                            combined.push((offset[n] || 0) + 1);
                        }

                        combined.push(before.column);
                    }

                    indent = combined.concat(indent);
                }

                node.position.indent = indent || [];

                return node;
            }

            return update;
        }

        /**
         * Add `node` to `parent`s children or to `tokens`.
         * Performs merges where possible.
         *
         * @example
         *   add({});
         *
         *   add({}, {children: []});
         *
         * @param {Object} node - Node to add.
         * @param {Object} [parent] - Parent to insert into.
         * @return {Object} - Added or merged into node.
         */
        add = function (node, parent) {
            var prev;
            var children;

            if (!parent) {
                children = tokens;
            } else {
                children = parent.children;
            }

            prev = children[children.length - 1];

            if (
                prev &&
                node.type === prev.type &&
                node.type in MERGEABLE_NODES &&
                mergeable(prev) &&
                mergeable(node)
            ) {
                node = MERGEABLE_NODES[node.type].call(
                    self, prev, node
                );
            }

            if (node !== prev) {
                children.push(node);
            }

            if (self.atStart && tokens.length) {
                self.exitStart();
            }

            return node;
        };

        /**
         * Remove `subvalue` from `value`.
         * Expects `subvalue` to be at the start from
         * `value`, and applies no validation.
         *
         * @example
         *   eat('foo')({type: 'text', value: 'foo'});
         *
         * @param {string} subvalue - Removed from `value`,
         *   and passed to `updatePosition`.
         * @return {Function} - Wrapper around `add`, which
         *   also adds `position` to node.
         */
        function eat(subvalue) {
            var indent = getOffset();
            var pos = position();
            var current = now();

            validateEat(subvalue);

            /**
             * Add the given arguments, add `position` to
             * the returned node, and return the node.
             *
             * @param {Object} node - Node to add.
             * @param {Object} [parent] - Node to insert into.
             * @return {Node} - Added node.
             */
            function apply(node, parent) {
                return pos(add(pos(node), parent), indent);
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
            function reset() {
                var node = apply.apply(null, arguments);

                line = current.line;
                column = current.column;
                value = subvalue + value;

                return node;
            }

            /**
             * Test the position, after eating, and reverse
             * to a not-eaten state.
             *
             * @return {Position} - Position after eating `subvalue`.
             */
            function test() {
                var result = pos({});

                line = current.line;
                column = current.column;
                value = subvalue + value;

                return result.position;
            }

            apply.reset = reset;
            apply.test = reset.test = test;

            value = value.substring(subvalue.length);

            updatePosition(subvalue);

            indent = indent();

            return apply;
        }

        /*
         * Expose `now` on `eat`.
         */

        eat.now = now;

        /*
         * Expose `file` on `eat`.
         */

        eat.file = self.file;

        /*
         * Sync initial offset.
         */

        updatePosition('');

        /*
         * Iterate over `value`, and iterate over all
         * tokenizers.  When one eats something, re-iterate
         * with the remaining value.  If no tokenizer eats,
         * something failed (should not happen) and an
         * exception is thrown.
         */

        while (value) {
            index = -1;
            length = methods.length;
            matched = false;

            while (++index < length) {
                name = methods[index];
                method = tokenizers[name];

                if (
                    method &&
                    (!method.onlyAtStart || self.atStart) &&
                    (!method.onlyAtTop || self.atTop) &&
                    (!method.notInBlockquote || !self.inBlockquote) &&
                    (!method.notInLink || !self.inLink)
                ) {
                    valueLength = value.length;

                    method.apply(self, [eat, value]);

                    matched = valueLength !== value.length;

                    if (matched) {
                        break;
                    }
                }
            }

            /* istanbul ignore if */
            if (!matched) {
                self.file.fail(ERR_INFINITE_LOOP, eat.now());

                /*
                 * Errors are not thrown on `File#fail`
                 * when `quiet: true`.
                 */

                break;
            }
        }

        self.eof = now();

        return tokens;
    }

    return tokenize;
}

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
    'paragraph': require('./block-tokenizers/paragraph')
};

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
    'paragraph'
];

/**
 * Block tokenizer.
 *
 * @example
 *   var parser = new Parser();
 *   parser.tokenizeBlock('> foo.');
 *
 * @param {string} value - Content.
 * @return {Array.<Object>} - Nodes.
 */

Parser.prototype.tokenizeBlock = tokenizeFactory(BLOCK);

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
    'inlineText': require('./inline-tokenizers/text')
};

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
    'inlineText'
];

/**
 * Inline tokenizer.
 *
 * @example
 *   var parser = new Parser();
 *   parser.tokenizeInline('_foo_');
 *
 * @param {string} value - Content.
 * @return {Array.<Object>} - Nodes.
 */

Parser.prototype.tokenizeInline = tokenizeFactory(INLINE);

/*
 * Expose `tokenizeFactory` so dependencies could create
 * their own tokenizers.
 */

Parser.prototype.tokenizeFactory = tokenizeFactory;

/*
 * Expose `parse` on `module.exports`.
 */

module.exports = Parser;
