const fs = require('fs')
const path = require('path')

module.exports = function () {
  return fs.existsSync(path.resolve(process.cwd(), 'yarn.lock'))
}
