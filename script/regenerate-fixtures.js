'use strict'

/* eslint-env node */
/* eslint-disable no-console */

/*
 * Dependencies.
 */

var fs = require('fs')
var path = require('path')
var remark = require('..')
var fixtures = require('../test/fixtures.js')

/*
 * Regenerate.
 */

fixtures.forEach(function (fixture) {
  var input = fixture.input
  var name = fixture.name
  var mapping = fixture.mapping

  Object.keys(mapping).forEach(function (key) {
    var filename = name + (key ? '.' + key : key) + '.json'
    var result

    try {
      result = remark.parse(input, fixture.possibilities[key])
    } catch (err) {
      console.log('Could not regenerate `' + filename + '`')
      throw err
    }

    result = JSON.stringify(result, null, 2) + '\n'

    fs.writeFileSync(path.join('test/tree/', filename), result)
  })
})
