'use strict'

/* eslint-env node, mocha */

var path = require('path')
var fs = require('fs')
var assert = require('assert')
var VFile = require('vfile')
var extend = require('extend')
var remark = require('..')
var fixtures = require('./fixtures.js')
var badges = require('./badges.js')
var mentions = require('./mentions.js')
var expect = require('chai').expect

/*
 * Settings.
 */

/**
 * No-operation.
 */
function noop () {}

/**
 * No-operation plugin.
 *
 * @return {Function} - `noop`.
 */
function plugin () {
  return noop
}

/**
 * Delayed no-operation transformer.
 *
 * @param {Node} node - Syntax-tree.
 * @param {VFile} file - Virtual file.
 * @param {Function} next - Callback invoked when done.
 */
function asyncTransformer (node, file, next) {
  setTimeout(next, 4)
}

/**
 * Delayed no-operation plugin.
 *
 * @return {Function} - `asyncTransformer`.
 */
function asyncAttacher () {
  return asyncTransformer
}

/**
 * Construct an empty node.
 *
 * @return {Node} - Empty `root` node.
 */
function empty () {
  return {
    type: 'root',
    children: [],
  }
}

/*
 * Tests.
 */

describe('remark.parse(file, options?)', function () {
  it('should accept a `string`', done => {
    return remark.parse('Alfred')
        .then(node => {
          assert(node.children.length === 1)
          done()
        })
  })

  it('should throw when `options` is not an object', function () {
    assert.throws(function () {
      remark.parse('', false)
    }, /options/)
  })

  it('should throw when `options.position` is not a boolean', function () {
    assert.throws(function () {
      remark.parse('', {
        position: 0,
      })
    }, /options.position/)
  })

  it('should throw when `options.gfm` is not a boolean', function () {
    assert.throws(function () {
      remark.parse('', {
        gfm: Infinity,
      })
    }, /options.gfm/)
  })

  it('should throw when `options.footnotes` is not a boolean', function () {
    assert.throws(function () {
      remark.parse('', {
        footnotes: 1,
      })
    }, /options.footnotes/)
  })

  it('should throw when `options.breaks` is not a boolean', function () {
    assert.throws(function () {
      remark.parse('', {
        breaks: 'unicorn',
      })
    }, /options.breaks/)
  })

  it('should throw when `options.pedantic` is not a boolean', () => {
    assert.throws(() => {
      remark.parse('', {
        pedantic: {},
      })
    }, /options.pedantic/)
  })

  it('should throw when `options.yaml` is not a boolean', function () {
    assert.throws(function () {
      remark.parse('', {
        yaml: [true],
      })
    }, /options.yaml/)
  })

  it('should throw parse errors', done => {
    var processor = remark()
    var message = 'Found it!'

    /**
     * Tokenizer.
     *
     * @param {Function} eat - Eater.
     * @param {string} value - Rest of content.
     */
    function emphasis (parser, value) {
      if (value.charAt(0) === '*') {
        parser.eat.file.fail(message, parser.eat.now())
      }
    }

    /**
     * Locator.
     *
     * @param {string} value - Value to search.
     * @param {number} fromIndex - Index to start searching at.
     * @return {number} - Location of possible auto-link.
     */
    function locator (parser, value, fromIndex) {
      return value.indexOf('*', fromIndex)
    }

    emphasis.locator = locator
    processor.Parser.prototype.inlineTokenizers.emphasis = emphasis

    processor.parse('Hello *World*!')
      .catch(exception => {
        assert(exception.file === '')
        assert(exception.line === 1)
        assert(exception.column === 7)
        assert(exception.reason === message)
        assert(exception.toString() === '1:7: ' + message)
        done()
      })
  })

  it('should warn when missing locators', function (done) {
    var processor = remark()
    var proto = processor.Parser.prototype
    var methods = proto.inlineMethods
    var file = new VFile('Hello *World*!')

    /** Tokenizer. */
    function noop () {}

    proto.inlineTokenizers.foo = noop
    methods.splice(methods.indexOf('inlineText'), 0, 'foo')

    file.quiet = true
    return processor.parse(file)
      .then(() => {
        assert.equal(String(file.messages[0]), '1:1: Missing locator: `foo`')
        done()
      })
  })

  it('should warn with entity messages', done => {
    var filePath = path.join('test', 'input', 'entities-advanced.text')
    var doc = fs.readFileSync(filePath, 'utf8')
    var file = new VFile(doc)
    var notTerminated = 'Named character references must be terminated by a semicolon'

    file.quiet = true

    remark.process(file)
      .then(() => {
        assert.deepEqual(file.messages.map(String), [
          '1:13: Named character references must be known',
          '5:15: ' + notTerminated,
          '10:14: ' + notTerminated,
          '12:38: ' + notTerminated,
          '15:16: ' + notTerminated,
          '15:37: ' + notTerminated,
          '14:16: ' + notTerminated,
          '18:17: ' + notTerminated,
          '19:21: ' + notTerminated,
          '17:16: ' + notTerminated,
          '24:16: ' + notTerminated,
          '24:37: ' + notTerminated,
          '22:11: ' + notTerminated,
          '29:17: ' + notTerminated,
          '30:21: ' + notTerminated,
          '28:17: ' + notTerminated,
          '33:11: ' + notTerminated,
          '36:27: ' + notTerminated,
          '37:10: ' + notTerminated,
          '41:25: ' + notTerminated,
          '42:10: ' + notTerminated,
        ])
        done()
      })
      .catch(done)
  })

  it('should be able to set options', done => {
    var processor = remark()
    var html = processor.Parser.prototype.blockTokenizers.html

    /**
     * Set option when an HMTL comment occurs:
     * `<!-- $key -->`, turns on `$key`.
     *
     * @param {function(string)} eat - Eater.
     * @param {string} value - Rest of content.
     */
    function replacement (eat, value) {
      var node = /<!--\s*(.*?)\s*-->/g.exec(value)
      var options = {}

      if (node) {
        options[node[1]] = true

        this.setOptions(options)
      }

      return html.apply(this, arguments)
    }

    processor.Parser.prototype.blockTokenizers.html = replacement

    processor
      .parse([
        '<!-- commonmark -->',
        '',
        '1)   Hello World',
        '',
      ].join('\n'))
      .then(result => {
        assert(result.children[1].type === 'list')
        done()
      })
  })
})

describe('remark.stringify(ast, file, options?)', function () {
  it('should throw when `ast` is not an object', () => {
    assert.throws(function () {
      remark.stringify(false)
    }, /false/)
  })

  it('should throw when `ast` is not a valid node', () => {
    assert.throws(function () {
      remark.stringify({
        type: 'unicorn',
      })
    }, /unicorn/)
  })

  it('should not throw when given a parsed file', done => {
    var file = new VFile('foo')

    remark.parse(file)
      .then(() => {
        assert.doesNotThrow(function () {
          remark.stringify(file)
        })
        done()
      })
      .catch(done)
  })

  it('should throw when `options` is not an object', function () {
    assert.throws(function () {
      remark.stringify(empty(), false)
    }, /options/)
  })

  it('should throw when `options.bullet` is not a valid list bullet', function () {
    assert.throws(function () {
      remark.stringify(empty(), {
        bullet: true,
      })
    }, /options\.bullet/)
  })

  it('should throw when `options.listItemIndent` is not a valid constant', () => {
    assert.throws(function () {
      remark.stringify(empty(), {
        listItemIndent: 'foo',
      })
    }, /options\.listItemIndent/)
  })

  it('should throw when `options.rule` is not a valid horizontal rule bullet', () => {
    assert.throws(function () {
      remark.stringify(empty(), {
        rule: true,
      })
    }, /options\.rule/)
  })

  it('should throw when `options.ruleSpaces` is not a boolean', () => {
    assert.throws(() => remark.stringify(empty(), { ruleSpaces: 1 }), /options\.ruleSpaces/)
  })

  it('should throw when `options.ruleRepetition` is not a valid repetition count', () => {
    assert.throws(function () {
      remark.stringify(empty(), {
        'ruleRepetition': 1,
      })
    }, /options\.ruleRepetition/)

    assert.throws(function () {
      remark.stringify(empty(), {
        'ruleRepetition': NaN,
      })
    }, /options\.ruleRepetition/)

    assert.throws(function () {
      remark.stringify(empty(), {
        'ruleRepetition': true,
      })
    }, /options\.ruleRepetition/)
  })

  it('should throw when `options.emphasis` is not a valid emphasis marker', () => {
    assert.throws(function () {
      remark.stringify(empty(), {
        'emphasis': '-',
      })
    }, /options\.emphasis/)
  })

  it('should throw when `options.strong` is not a valid emphasis marker', () => {
    assert.throws(function () {
      remark.stringify(empty(), {
        'strong': '-',
      })
    }, /options\.strong/)
  })

  it('should throw when `options.setext` is not a boolean', () => {
    assert.throws(function () {
      remark.stringify(empty(), {
        'setext': 0,
      })
    }, /options\.setext/)
  })

  it('should throw when `options.incrementListMarker` is not a boolean', () => {
    assert.throws(function () {
      remark.stringify(empty(), {
        'incrementListMarker': -1,
      })
    }, /options\.incrementListMarker/)
  })

  it('should throw when `options.fences` is not a boolean', function () {
    assert.throws(function () {
      remark.stringify(empty(), {
        fences: NaN,
      })
    }, /options\.fences/)
  })

  it('should throw when `options.fence` is not a ' +
    'valid fence marker',
    function () {
      assert.throws(function () {
        remark.stringify(empty(), {
          'fence': '-',
        })
      }, /options\.fence/)
    }
  )

  it('should throw when `options.closeAtx` is not a boolean', () => {
    assert.throws(function () {
      remark.stringify(empty(), {
        'closeAtx': NaN,
      })
    }, /options\.closeAtx/)
  })

  it('should throw when `options.looseTable` is not a boolean', () => {
    assert.throws(function () {
      remark.stringify(empty(), {
        'looseTable': 'Hello!',
      })
    }, /options\.looseTable/)
  })

  it('should throw when `options.spacedTable` is not a boolean', () => {
    assert.throws(function () {
      remark.stringify(empty(), {
        spacedTable: 'World',
      })
    }, /options\.spacedTable/)
  })

  it('should be able to set options', done => {
    var processor = remark()
    var html = processor.Compiler.prototype.visitors.html

    processor.parse([
      '<!-- setext -->',
      '',
      '# Hello World',
      '',
    ].join('\n'))
    .then(ast => {
      /**
       * Set option when an HMTL comment occurs:
       * `<!-- $key -->`, turns on `$key`.
       *
       * @param {Object} node - Node to compile.
       * @return {string} - Compiled `node`.
       */
      function replacement (node) {
        var value = node.value
        var result = /<!--\s*(.*?)\s*-->/g.exec(value)
        var options = {}

        if (result) {
          options[result[1]] = true

          this.setOptions(options)
        }

        return html.apply(this, arguments)
      }

      processor.Compiler.prototype.visitors.html = replacement

      assert(processor.stringify(ast) === [
        '<!-- setext -->',
        '',
        'Hello World',
        '===========',
        '',
      ].join('\n'))

      done()
    })
    .catch(done)
  })
})

describe('remark.use(plugin, options?)', function () {
  it('should accept an attacher', function () {
    remark.use(noop)
  })

  it('should accept multiple attachers', function () {
    remark.use([function () {}, function () {}])
  })

  it('should attach multiple attachers in the correct order', function () {
    var order = []

    remark.use([function () {
      order.push(1)
    }, function () {
      order.push(2)
    }])

    assert.deepEqual(order, [1, 2])
  })

  it('should return an instance of remark', function () {
    var processor = remark.use(noop)

    assert(remark.use(noop) instanceof processor.constructor)
  })

  it('should attach an attacher', function () {
    var processor = remark.use(noop)

    assert(processor.ware.attachers.length === 1)
  })

  it('should attach a transformer', function () {
    var processor = remark.use(plugin)

    assert(processor.ware.fns.length === 1)
  })

  it('should attach multiple attachers', function () {
    var processor = remark.use(function () {}).use(function () {})

    assert(processor.ware.attachers.length === 2)
  })

  it('should attach multiple transformers', function () {
    var processor

      /**
       * Transformer.
       */
    processor = remark.use(function () {
      return function () {}
    }).use(function () {
      return function () {}
    })

    assert(processor.ware.fns.length === 2)
  })

  it('should attach the same transformer multiple times', function () {
    var processor

      /**
       * Transformer.
       */
    function transformer () {}

    processor = remark.use(function () {
      return transformer
    }).use(function () {
      return transformer
    })

    assert(processor.ware.fns.length === 2)
  })

  it('should invoke an attacher when `use()` is invoked', function () {
    var options = {}
    var isInvoked

      /**
       * Attacher.
       *
       * @param {remark} processor - Processor.
       * @param {Object} settings - Configuration.
       */
    function assertion (processor, settings) {
      assert('use' in processor)
      assert(settings === options)

      isInvoked = true
    }

    remark.use(assertion, options)

    assert(isInvoked === true)
  })

  it('should fail if an exception occurs in an attacher', function () {
    var exception = new Error('test')

      /**
       * Thrower.
       */
    function thrower () {
      throw exception
    }

    assert.throws(function () {
      remark.use(thrower)
    }, /test/)
  })
})

describe('remark.run(ast, file?, done?)', function () {
  it('should accept an ast', function () {
    remark.run(empty())
  })

  it('should throw when `ast` is not an AST', function () {
    assert.throws(function () {
      remark.run(false)
    }, /false/)
  })

  it('should accept a `file`', function () {
    remark.run(empty(), new VFile())
  })

  it('should return the given ast', function () {
    var node = empty()

    assert(node === remark.run(node))
  })

  it('should accept a `done` callback, without file', function (done) {
    remark.run(empty(), function (err) {
      done(err)
    })
  })

  it('should accept a `done` callback', function (done) {
    remark.run(empty(), {
      'filename': 'Untitled',
      'extension': 'md',
      'contents': '',
    }, function (err) {
      done(err)
    })
  })
})

describe('remark.process(value, options, done)', function () {
  it('should parse and stringify a file', done => {
    return remark.process('*foo*')
      .then(res => {
        assert(res.result === '_foo_\n')
        done()
      })
  })

  it('should accept parse options', done => {
    return remark.process('1)  foo', { commonmark: true })
      .then(res => {
        assert(res.result === '1.  foo\n')
        done()
      })
  })

  it('should accept stringify options', done => {
    return remark.process('# foo', { closeAtx: true })
      .then(res => {
        assert(res.result === '# foo #\n')
        done()
      })
  })

  it('should run plugins', done => {
    return remark.use(mentions).process('@mention')
      .then(res => {
        assert(res.result === '[@mention](https://github.com/blog/821)\n')
        done()
      })
  })

  it('should run async plugins', done => {
    return remark.use(asyncAttacher).process('Foo')
      .then(() => done())
      .catch(done)
  })

  it('should pass an async error', done => {
    var exception = new Error('test')

    /**
     * Transformer.
     *
     * @param {Node} ast - Syntax-tree.
     * @param {VFile} file - Virtual file.
     * @param {Function} next - Callback invoked when done.
     */
    function transformer (ast, file, next) {
      setTimeout(function () {
        next(exception)
      }, 4)
    }

    /**
     * Attacher.
     */
    function attacher () {
      return transformer
    }

    remark.use(attacher).process('Foo')
      .catch(err => {
        assert(err === exception)
        done()
      })
  })

  it('should throw an error', function () {
    var exception = new Error('test')

    /**
     * Transformer.
     */
    function transformer () {
      throw exception
    }

    /**
     * Attacher.
     */
    function attacher () {
      return transformer
    }

    try {
      remark.use(attacher).process('Foo')
    } catch (err) {
      assert(err === exception)
    }
  })

  it('should throw when `pedantic` is `true`, `listItemIndent` is not `tab`, and compiling code in a list-item', done => {
    remark.process([
      '* List',
      '',
      '        code()',
    ].join('\n'), {
      pedantic: true,
      listItemIndent: '1',
    })
    .catch(err => {
      expect(err.message).to.match(/Cannot indent code properly. See http:\/\/git.io\/vgFvT/)
      done()
    })
  })
})

describe('function attacher(remark, options)', function () {
  /*
   * Lot's of other tests are in
   * `remark.use(plugin, options)`.
   */

  it('should be able to modify `Parser` without affecting other instances',
    done => {
      var doc = 'Hello w/ a @mention!\n'

      return remark.use(mentions).process(doc)
        .then(res => assert(res.result === 'Hello w/ a [@mention](https://github.com/blog/821)!\n'))
        .then(() => remark.process(doc))
        .then(res => assert(res.result === doc))
        .then(() => done())
    }
  )
})

describe('function transformer(ast, file, next?)', () => {
  it('should be invoked when `run()` is invoked', done => {
    return remark.parse('# Hello world')
      .then(result => {
        var isInvoked

        /**
         * Plugin.
         *
         * @param {Node} ast - Syntax-tree.
         * @param {VFile} file - Virtual file.
         */
        function assertion (ast, file) {
          assert.equal(ast, result)
          assert('hasFailed' in file)

          isInvoked = true
        }

        /**
         * Attacher.
         */
        function attacher () {
          return assertion
        }

        remark.use(attacher).run(result)

        assert(isInvoked === true)
        done()
      })
  })

  it('should fail remark if an exception occurs', done => {
    var exception = new Error('test')
    var fixture = '# Hello world'
    return remark.parse(fixture)
      .then(ast => {
        /**
         * Thrower.
         */
        function thrower () {
          throw exception
        }

        /**
         * Attacher.
         */
        function attacher () {
          return thrower
        }

        assert.throws(function () {
          remark.use(attacher).run(ast)
        }, /test/)

        done()
      })
  })

  it('should fail remark if an exception is returned', done => {
    var exception = new Error('test')
    var fixture = '# Hello world'
    return remark.parse(fixture)
      .then(ast => {
        /**
         * Returner.
         */
        function thrower () {
          return exception
        }

        /**
         * Attacher.
         */
        function attacher () {
          return thrower
        }

        assert.throws(function () {
          remark.use(attacher).run(ast)
        }, /test/)

        done()
      })
  })

  it('should work on an example plugin', done => {
    return remark.use(badges).process('# remark')
      .then(source => {
        assert(
            source.result ===
            '# remark [![Version](http://img.shields.io/npm/v/remark.svg)' +
            '](https://www.npmjs.com/package/remark)\n'
        )

        return remark.use(badges, {
          flat: true,
        }).process('# remark')
      })
      .then(source => {
        assert(
            source.result ===
            '# remark [![Version](http://img.shields.io/npm/v/remark.svg' +
            '?style=flat)](https://www.npmjs.com/package/remark)\n'
        )
        done()
      })
      .catch(done)
  })
})

var validateToken
var validateTokens

/**
 * Validate `children`.
 *
 * @param {Array.<Object>} children - Nodes to validate.
 */
validateTokens = function (children) {
  children.forEach(validateToken)
}

/**
 * Validate `context`.
 *
 * @param {Object} context - Node to validate.
 */
validateToken = function (context) {
  var keys = Object.keys(context).length
  var type = context.type

  assert('type' in context)

  if ('children' in context) {
    assert(Array.isArray(context.children))
    validateTokens(context.children)
  }

    /*
     * Validate position.
     */

  if (context.position) {
    assert('start' in context.position)
    assert('end' in context.position)

    assert('line' in context.position.start)
    assert('column' in context.position.start)

    assert('line' in context.position.end)
    assert('column' in context.position.end)
  }

  if ('position' in context) {
    keys--
  }

  if ('value' in context) {
    assert(typeof context.value === 'string')
  }

  if (type === 'root') {
    assert('children' in context)

    if (context.footnotes) {
      Object.keys(context.footnotes).forEach(function (id) {
        validateToken(context.footnotes[id])
      })
    }

    return
  }

  if (
      type === 'paragraph' ||
      type === 'blockquote' ||
      type === 'tableRow' ||
      type === 'tableCell' ||
      type === 'strong' ||
      type === 'emphasis' ||
      type === 'delete'
  ) {
    assert(keys === 2)
    assert('children' in context)

    return
  }

  if (type === 'listItem') {
    assert(keys === 3 || keys === 4)
    assert('children' in context)
    assert(typeof context.loose === 'boolean')

    if (keys === 4) {
      assert(
          context.checked === true ||
          context.checked === false ||
          context.checked === null
      )
    }

    return
  }

  if (type === 'footnote') {
    assert(keys === 2)
    assert('children' in context)

    return
  }

  if (type === 'heading') {
    assert(keys === 3)
    assert(context.depth > 0)
    assert(context.depth <= 6)
    assert('children' in context)

    return
  }

  if (
      type === 'text' ||
      type === 'inlineCode' ||
      type === 'yaml'
  ) {
    assert(keys === 2)
    assert('value' in context)

    return
  }

  if (type === 'code') {
    assert(keys === 3)
    assert('value' in context)

    assert(
        context.lang === null ||
        typeof context.lang === 'string'
    )

    return
  }

  if (type === 'thematicBreak' || type === 'break') {
    assert(keys === 1)

    return
  }

  if (type === 'list') {
    assert('children' in context)
    assert(typeof context.ordered === 'boolean')
    expect(context.loose).to.be.a('boolean')
    assert(keys === 5)

    if (context.ordered) {
      assert(typeof context.start === 'number')
      assert(context.start === context.start)
    } else {
      assert(context.start === null)
    }

    return
  }

  if (type === 'footnoteDefinition') {
    assert(keys === 3)
    assert('children' in context)
    assert(typeof context.identifier === 'string')

    return
  }

  if (type === 'definition') {
    assert(typeof context.identifier === 'string')

    assert(
      context.title === null ||
      typeof context.title === 'string'
    )

    assert(typeof context.url === 'string')
    assert(context.link === undefined)

    assert(keys === 4)

    return
  }

  if (type === 'link') {
    assert('children' in context)
    assert(
      context.title === null ||
      typeof context.title === 'string'
    )
    assert(typeof context.url === 'string')
    assert(context.href === undefined)
    assert(keys === 4)

    return
  }

  if (type === 'image') {
    assert(
      context.title === null ||
      typeof context.title === 'string'
    )
    assert(
      context.alt === null ||
      typeof context.alt === 'string'
    )
    assert(typeof context.url === 'string')
    assert(context.src === undefined)
    assert(keys === 4)

    return
  }

  if (type === 'linkReference') {
    assert('children' in context)
    assert(typeof context.identifier === 'string')

    assert(
      context.referenceType === 'shortcut' ||
      context.referenceType === 'collapsed' ||
      context.referenceType === 'full'
    )

    assert(keys === 4)

    return
  }

  if (type === 'imageReference') {
    assert(typeof context.identifier === 'string')

    assert(
      context.alt === null ||
      typeof context.alt === 'string'
    )

    assert(
      context.referenceType === 'shortcut' ||
      context.referenceType === 'collapsed' ||
      context.referenceType === 'full'
    )

    assert(keys === 4)

    return
  }

  if (type === 'footnoteReference') {
    assert(typeof context.identifier === 'string')
    assert(keys === 2)

    return
  }

  if (type === 'table') {
    assert(keys === 3)
    assert('children' in context)

    assert(Array.isArray(context.align))

    context.align.forEach(function (align) {
      assert(
        align === null ||
        align === 'left' ||
        align === 'right' ||
        align === 'center'
      )
    })

    return
  }

    /* This is the last possible type. If more types are added, they
     * should be added before this block, or the type:html tests should
     * be wrapped in an if statement. */
  assert(type === 'html')
  assert(keys === 2)
  assert('value' in context)
}

/**
 * Compress array of nodes by merging adjacent text nodes when possible.
 *
 * This usually happens inside Parser, but it also needs to be done whenever
 * position info is stripped from the AST.
 *
 * @param {Array.<Object>} nodes - Nodes to merge.
 * @return {Array.<Object>} - Merged nodes.
 */
function mergeTextNodes (nodes) {
  if (!nodes.length || nodes[0].position) {
    return nodes
  }

  var result = [nodes[0]]

  nodes.slice(1).forEach(function (node) {
    if (node.type === 'text' && result[result.length - 1].type === 'text') {
      result[result.length - 1].value += node.value
    } else {
      result.push(node)
    }
  })

  return result
}

/**
 * Clone, and optionally clean from `position`, a node.
 *
 * @param {Object} node - Node to clone.
 * @param {boolean} clean - Whether to clean.
 * @return {Object} - Cloned node.
 */
function clone (node, clean) {
  var result = Array.isArray(node) ? [] : {}

  Object.keys(node).forEach(function (key) {
    var value = node[key]

    if (value === undefined) {
      return
    }

    /*
     * Remove `position` when needed.
     */

    if (clean && key === 'position') {
      return
    }

    /*
     * Ignore `checked` attributes set to `null`,
     * which only exist in `gfm` on list-items
     * without a checkbox.  This ensures less
     * needed fixtures.
     */

    if (key === 'checked' && value === null) {
      return
    }

    if (value !== null && typeof value === 'object') {
      result[key] = clone(value, clean)
      if (key === 'children') {
        result[key] = mergeTextNodes(result[key])
      }
    } else {
      result[key] = value
    }
  })

  return result
}

/*
 * Methods.
 */

/**
 * Diff node.
 *
 * @param {Node} node - Node to diff.
 * @param {Node} baseline - Baseline reference.
 * @param {boolean} clean - Whether to clean `node`.
 * @param {boolean} cleanBaseline - Whether to clean
 *   `baseline`.
 */
function compare (node, baseline, clean, cleanBaseline) {
  validateToken(node)

  if (clean && !cleanBaseline) {
    cleanBaseline = true
  }

  expect(clone(node, clean)).to.eql(clone(baseline, cleanBaseline))
}

/*
 * Fixtures.
 */

describe.only('fixtures', function () {
  let fixtureNo = 0
  fixtures.forEach(function (fixture) {
    describe(`fixture #${++fixtureNo}, ${fixture.name}`, function () {
      var input = fixture.input
      var possibilities = fixture.possibilities
      var mapping = fixture.mapping
      var trees = fixture.trees
      var output = fixture.output

      Object.keys(possibilities).forEach(function (key) {
        var name = key || 'default'
        var parse = possibilities[key]
        var stringify = extend({}, fixture.stringify, {
          gfm: parse.gfm,
          commonmark: parse.commonmark,
          pedantic: parse.pedantic,
        })
        var initialClean = !parse.position
        var node
        var markdown

        it('should parse `' + name + '` correctly', done => {
          return remark.parse(input, parse)
            .then(node_ => {
              node = node_

              /*
               * The first assertion should not clean positional
               * information, except when `position: false`: in that
               * case the baseline should be stripped of positional
               * information.
               */

              compare(node, trees[mapping[key]], false, initialClean)

              markdown = remark.stringify(node, stringify)

              done()
            })
            .catch(done)
        })

        if (output !== false) {
          it('should stringify `' + name + '`', done => {
            return remark.parse(markdown, parse)
              .then(res => {
                compare(node, res, true)
                done()
              })
              .catch(done)
          })
        }

        if (output === true) {
          it('should stringify `' + name + '` exact', function () {
            expect(markdown).to.eq(fixture.input)
          })
        }
      })
    })
  })
})
//
// const oldRemark = require('../../old-remark')
// // failing 30, 53, 55, 56, 57, 60, 61, 62, 63 ...
// // [80] 113, ... [150]
// var runonly = 144
// describe.only('fixtures1', function () {
//   let fixtureNo = 0
//   fixtures/*.slice(runonly, runonly + 1)*/.forEach(function (fixture) {
//     describe(`fixture #${++fixtureNo}, ${fixture.name}`, function () {
//       var input = fixture.input
//       var possibilities = fixture.possibilities
//       var mapping = fixture.mapping
//       var trees = fixture.trees
//       var output = fixture.output
//
//       Object.keys(possibilities).forEach(function (key) {
//         var name = key || 'default'
//         var parse = possibilities[key]
//         var stringify = extend({}, fixture.stringify, {
//           gfm: parse.gfm,
//           commonmark: parse.commonmark,
//           pedantic: parse.pedantic
//         })
//         var initialClean = !parse.position
//         var node
//         var markdown
//
//         it('should parse `' + name + '` correctly', done => {
//           return remark.parse(input, parse)
//             .then(node_ => {
//               node = node_
//
//               /*
//                * The first assertion should not clean positional
//                * information, except when `position: false`: in that
//                * case the baseline should be stripped of positional
//                * information.
//                */
//
//                /*console.log(JSON.stringify(node, null, 1))
//                console.log('!!!!!!!!!!!!!!!!!!!!!!')
//                console.log('!!!!!!!!!!!!!!!!!!!!!!')
//                console.log('!!!!!!!!!!!!!!!!!!!!!!')
//                console.log('!!!!!!!!!!!!!!!!!!!!!!')
//               console.log(JSON.stringify(trees[mapping[key]], null, 1))*/
//               compare(node, oldRemark.parse(input, parse), false, initialClean)
//
//               markdown = remark.stringify(node, stringify)
//
//               done()
//             })
//             .catch(done)
//         })
//
//         if (output !== false) {
//           it('should stringify `' + name + '`', done => {
//             return remark.parse(markdown, parse)
//               .then(res => {
//                 compare(node, res, true)
//                 done()
//               })
//               .catch(done)
//           })
//         }
//
//         if (output === true) {
//           it('should stringify `' + name + '` exact', function () {
//             expect(markdown).to.eq(fixture.input)
//           })
//         }
//       })
//     })
//   })
// })
