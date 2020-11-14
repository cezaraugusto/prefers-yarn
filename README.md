[action-image]: https://github.com/cezaraugusto/prefers-yarn/workflows/CI/badge.svg
[action-url]: https://github.com/cezaraugusto/prefers-yarn/actions
[npm-image]: https://img.shields.io/npm/v/prefers-yarn.svg
[npm-url]: https://npmjs.org/package/prefers-yarn

# prefers-yarn [![workflow][action-image]][action-url] [![npm][npm-image]][npm-url]

> Check whether the working directory prefers yarn over npm

## Installation

```
npm install prefers-yarn
```

## Usage
```js
const prefersYarn = require('prefers-yarn')

const useYarn = prefersYarn() // boolean

if (useYarn) {
  // do stuff
}

```

## License

MIT (c) Cezar Augusto.
