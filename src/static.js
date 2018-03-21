const fs = require('fs'),
  glob = require('glob');

function Static () {}

Static.prototype = {
  copy(source, target) {
    let sources = Array.isArray(source) ? source : [source];

    this.validatePathExists(target.substring(0, target.lastIndexOf('/')));
    return Promise.all(sources.map(source => {
      glob.sync(source, {})
        .forEach(file => {
          let fileTarget = this.getFileTargt(file, target),
            err = fs.copyFileSync(file, fileTarget);

          if (!fs.lstatSync(target).isDirectory() || err) {
            return new Promise((resolve, reject) => (err ? reject(err): resolve()));
          } else {
            return this.copy(file + '/*.*', fileTarget + '/');
          }
        });
    }));
  },

  getFileTargt(file, target) {
    if (target.match(/\/$/)) {
      target += file.substr(file.lastIndexOf('/') + 1);
    }

    return target;
  },

  validatePathExists(path) {
    path.split('/').reduce((acc, folder) => {
      acc += folder;
      if (!fs.existsSync(acc)) {
        fs.mkdirSync(acc);
      }
      return acc + '/';
    }, '');
  },

  removeFolder(path) {
    let curPath;

    if (fs.existsSync(path)) {
      fs.readdirSync(path)
        .forEach(file => {
          curPath = path + '/' + file;

          if(fs.statSync(curPath).isDirectory()) { // recurse
            this.removeFolder(curPath);
          } else { // delete file
            fs.unlinkSync(curPath);
          }
        });
      fs.rmdirSync(path);
    }
  },

  mapFile(fileName) {
    return new Promise(resolve => resolve(glob.sync(fileName, {})));
  },
};

module.exports = new Static();