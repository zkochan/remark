module.exports = [
  {
    name: 'escape',
    func: require('./escape'),
  },
  {
    name: 'autoLink',
    func: require('./auto-link'),
  },
  {
    name: 'url',
    func: require('./url'),
  },
  {
    name: 'tag',
    func: require('./tag'),
  },
  {
    name: 'link',
    func: require('./link'),
  },
  {
    name: 'reference',
    func: require('./reference'),
  },
  // shortcutReference?
  {
    name: 'strong',
    func: require('./strong'),
  },
  {
    name: 'emphasis',
    func: require('./emphasis'),
  },
  {
    name: 'deletion',
    func: require('./deletion'),
  },
  {
    name: 'inlineCode',
    func: require('./code'),
  },
  {
    name: 'break',
    func: require('./break'),
  },
  {
    name: 'inlineText',
    func: require('./text'),
  },
]
