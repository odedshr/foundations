import rollup from 'rollup';
import babel from 'babel-core';
import UglifyJS from 'uglify-js';
import mapNested from './map-nested.js';

const importPattern = `import.*(["\\'])(.*\\.js)\\1`,
  defaultFormat = 'cjs';
  
export default {
   /**
   * Returns a promise for a merged, transpiled and uglified version of an es6 file
   * @param {Object} options can be a single string file name, or array of string filenames,
   * or an Object with the following parameters
   * - @param {String} source - single string file name, or array of string filenames
   * - @param {String} format - amd, cjs, es, iife, umd
   * - @param {String} external - single string file name, or array of string of files that not part of the bundle
   */
  compile(options) {
    let filenames,
      external = [],
      format = defaultFormat;
    if (options instanceof Object) {
      if (Array.isArray(options)) {
        // options is just an array of sources
        filenames = options;
      } else {
        // options is a complex object
        filenames = Array.isArray(options.source) ? [...options.source] : [options.source];
        external = options.external || external;
        format = options.format || format;
      }
    } else {
      //options is just a string
      filenames = [ options ];
    }

    return this.loadFiles(filenames, format, external)
      .then(fileSet => {
        if(fileSet.content.length === 0) {
          return fileSet;
        }

        return this.transpile(fileSet.content)
          .then(this.minify)
          .then(transpiledAndUglified => {
            fileSet.content = transpiledAndUglified;
            return fileSet;
          });
      });
  },

  /**
  * Returns a promise for a minified js code
  * @param {String} jsCode code 
  */
  minify(jsCode) {
    return new Promise((resolve, reject) => {
      let output = UglifyJS.minify(jsCode);
      
      output.error ? reject(output.error) : resolve(output.code);
    });
  },

  /**
  * Returns a promise for a transpiled code
  * @param {String} esCode es6 code
  * @param {Boolean} minified (default is node)
  */
  transpile(esCode, minified = false) {
    return new Promise(resolve => resolve(babel.transform(esCode, { presets: ['env'], minified }).code));
  },

  /**
  * Returns a promise for a list of all files linked by `import` to the input file
  * @param {String} fileName 
  */
  mapFile(fileName, external = []) {
    return new Promise(resolve => resolve(mapNested(fileName, importPattern, external)));
  },
  
  /**
   * Returns a promise for a code of all files linked by `import` to the input files
   * @param {String[]} input list of files to load
   * @param {String} format of output files (default is 'cjs')
   */  
  loadFiles(input, format = defaultFormat, external = []) {
    return Promise
      .all(input.map(file => this.loadFile(file, format, external)))
      .then(res => res.reduce((memo, item) => {
        memo.files = memo.files.concat(item.files);
        memo.content += item.content;
        return memo;
      }, { files: [], content: ''}));
  },

  /**
  * Returns a promise for a code of all files linked by `import` to the input file
  * @param {String} input filename
  * @param {String} format of output files (default is 'cjs')* 
  */
  loadFile(input, format = defaultFormat, external = []) {
    return rollup.rollup({ input, external })
      .then(bundle => bundle.generate({ format }))
      .then (result => ({
        files: result.modules,
        content: result.code
      }));
  }
};