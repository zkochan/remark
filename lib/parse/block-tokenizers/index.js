module.exports = [
  {
    name: 'yamlFrontMatter',
    func: require('./yaml-front-matter'),
  },
  {
    name: 'newline',
    func: require('./new-line'),
  },
  {
    name: 'code',
    func: require('./code'),
  },
  {
    name: 'fences',
    func: require('./fences'),
  },
  {
    name: 'blockquote',
    func: require('./blockquote'),
  },
  {
    name: 'heading',
    func: require('./heading'),
  },
  {
    name: 'thematicBreak',
    func: require('./thematic-break'),
  },
  {
    name: 'list',
    func: require('./list'),
  },
  {
    name: 'lineHeading',
    func: require('./line-heading'),
  },
  {
    name: 'html',
    func: require('./html'),
  },
  {
    name: 'footnoteDefinition',
    func: require('./footnote'),
  },
  {
    name: 'definition',
    func: require('./definition'),
  },
  // looseTable?
  {
    name: 'table',
    func: require('./table'),
  },
  {
    name: 'paragraph',
    func: require('./paragraph'),
  },
]
