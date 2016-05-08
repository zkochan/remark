'use strict'
var ccount = require('ccount')

/*
 * Expressions.
 */

var EXPRESSIONS_WHITE_SPACE = /\s/

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
module.exports = function encloseURI (uri, always) {
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
