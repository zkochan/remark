'use strict'
const visitors = {}

visitors.block = require('./block')

visitors.root = require('./root')

visitors.heading = require('./heading')

visitors.text = require('./text')

visitors.paragraph = require('./paragraph')

visitors.blockquote = require('./blockquote')

visitors.list = require('./list')

visitors.inlineCode = require('./inline-code')

visitors.yaml = require('./yaml')

visitors.code = require('./code')

visitors.html = require('./html')

visitors.thematicBreak = require('./thematic-break')

visitors.strong = require('./strong')

visitors.emphasis = require('./emphasis')

visitors.break = require('./break')

visitors.delete = require('./delete')

visitors.link = require('./link')

visitors.linkReference = require('./link-reference')

visitors.imageReference = require('./image-reference')

visitors.footnoteReference = require('./footnote-reference')

visitors.definition = require('./definition')

visitors.image = require('./image')

visitors.footnote = require('./footnote')

visitors.footnoteDefinition = require('./footnote-definition')

visitors.table = require('./table')

visitors.tableCell = require('./table-cell')

module.exports = visitors
