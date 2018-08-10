
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { watch } from 'chokidar';
import Errors from '../etc/Errors.js';
import colors from '../etc/console-colors.js';
import css from './css.js';
import html from './html.js';
import js from './js.js';
import files from './files.js';

const defaultHandleError = error => console.error(error),
  WATCH_TIMEOUT = 2000,
  types = new Map([
    ['js', { regExp: /\.js$/, id: 'js', handler: js }],
    ['css', { regExp: /\.css$/, id: 'css', handler: css }],
    ['html', { regExp: /\.html$/, id: 'html', handler: html }],
    ['files', { regExp: /\/$/, id: 'files', handler: files }]
  ]);

/**
 * Runs `method()` and conole.time the time it took, along with `label`
 * @param {String} label
 * @param {Function} method
 */
function logged(label, method) {
  const time = new Date();

  label = `${padTwoDigits(time.getHours())}:${padTwoDigits(
    time.getMinutes()
  )}:${padTwoDigits(time.getSeconds())} ${label}`;
  console.time(label);
  method();
  console.timeEnd(label);
}

function padTwoDigits(num) {
  return ('00' + num).slice(-2);
}

/**
 * loads and parse application maps
 * @param {String} fileName
 * @throws NotFoundError if file not found
 */
function readMapFile(mapFile) {
  if (!existsSync(fileName)) {
    throw new Errors.NotFound('map.json', fileName);
  }

  return JSON.parse(readFileSync(fileName, 'utf-8'));

}

/**
 * Returns an absolute path for a file
 * @param {String} path
 * @param {String} file
 */
function getAbsolutePath(path, file) {
  if (path.length > 0 && !path.match(/\/$/)) {
    path += '/';
  }

  return `${process.cwd()}/${(path + file).replace('//', '/')}`;
}

/**
 * Returns a Map of fileName => absolute values
 * @param {String} path
 * @param {Strings[]} entries array of file name
 */
function getAbsolutePathes(path, entries) {
  let map = new Map();

  Object.keys(entries).forEach(entry =>
    map.set(entry, getMappedEntries(path, entries[entry]))
  );

  return map;
}

/**
 * Returns
 * @param {String} output fileName
 * @param {Strings[]} files to watch
 * @param {Function} mapFunc
 * @param {String} target folder
 */
function getWatcherPromises(output, files, mapFunc, target, handleError) {
  let options, external;

  if (files.source) {
    options = files;
    external = options.external;
    files = files.source;
  }

  return files.map(file =>
    mapFunc(file, external).then(results =>
      getWatchers(file, results, output, target, options, handleError)
    )
  );
}

/**
 * Returns an array of objects { file(name), watcher }
 * @param {String[]} files files to watch
 * @param {String} output file name
 * @param {String} target path
 */
function getWatchers(rootFile, files, output, target, options, handleError) {
  return files.map(file => {
    let timeOut; // fs.watch tends to run twice so we'll debounce it using a timeout

    return {
      file,
      options,
      watcher: watch(file)
      .on('raw', (event, path, details) => {
        if (!timeOut) {
          timeOut = setTimeout(() => {
            logged(
              `${colors.FgGreen}✓${colors.Reset} ${colors.Dim}Recompiled${
                colors.Reset
              } ` + `${colors.FgCyan}${output}${colors.Reset}`,
              writeToFile
                .bind(
                  {},
                  target,
                  output,
                  options || rootFile,
                  getFileType(output),
                  path
                )
                //.catch(handleError)
            );
            timeOut = null;
          }, WATCH_TIMEOUT);
        }
      })
    };
  });
}

/**
 * Returns a file's appropriate type from a fixed Map of files types
 * @param {String} fileName
 */
function getFileType(fileName) {
  let type = Array.from(types.values()).find(type =>
    type.regExp.test(fileName)
  );

  return type || types.get('files');
}

/**
 * Compile and writes a file to the file-system. if file type is `static` and source is missing, it will remove target file
 * @param {String} targetPath
 * @param {String} targetFileName
 * @param {String} sourceFile
 * @param {Object} fileTypeDef containing `id` and a `handler` that has a `compile` function (unless `id`===`static)
 * @param {String} triggeredByFile a source file which was deleted (and should be removed from target folder)
 */
function writeToFile(
  targetPath,
  targetFileName,
  sourceFile,
  fileTypeDef,
  triggeredByFile
) {
  let absoluteTarget = getAbsolutePath(targetPath, targetFileName);

  if (fileTypeDef.id === 'files') {
    if (triggeredByFile !== undefined) {
      removeFileIfRedundant(
        triggeredByFile,
        sourceFile,
        `${targetPath}/${targetFileName}`
      );
    }

    return files.copy(sourceFile, getAbsolutePath(targetPath, targetFileName));
  } else {
    return fileTypeDef.handler.compile(sourceFile).then(response => {
      files.addPath(
        absoluteTarget.substring(0, absoluteTarget.lastIndexOf('/'))
      );
      writeFileSync(absoluteTarget, response.content);

      return response;
    });
  }
}

/**
 * Removes a file if not found in source
 * @param {String} file
 * @param {String[]} entries
 * @param {String} destPath
 */
function removeFileIfRedundant(file, entries, destPath) {
  if (
    !entries.find(entry => {
      if (entry === file) {
        // if entry is the actual file
        return existsSync(entry);
      } else if (entry.substring(entry.length - 1) === '/') {
        // if entry is a folder containing the file
        return existsSync(`${entry}${file}`);
      }

      return false;
    }) &&
    existsSync(`${destPath}${file}`)
  ) {
    unlinkSync(`${destPath}${file}`);
  }
}

/**
 * return an array of source from app.map.json "entries" object
 * @param {Object} entry
 */
function getMappedEntries(source, entry) {
  let sources;

  if (entry instanceof Object) {
    if (Array.isArray(entry)) {
      sources = entry;
    } else {
      let entryCopy = Object.assign({}, entry);
      entryCopy.source = getMappedEntries(source, entryCopy.source);

      return entryCopy;
    }
  } else {
    sources = [entry];
  }

  return sources.map(file => getAbsolutePath(source, file));
}

/**
 * Builds destination folder according to appMap description
 * @param {Object} appMap OR filename
 */
function once(appMap, handleError = defaultHandleError) {
  if (typeof appMap === 'string') {
    appMap = readMapFile(appMap);
  }

  let source = appMap.source || '',
      target = appMap.target || '';

  if (appMap.entries === undefined) {
    handleError(new Errors.BadInput(mapFile, 'Missing `source` property'));
  }

  return Promise.all(
    Object.keys(appMap.entries).map(entry =>
      writeToFile(
        target,
        entry,
        getMappedEntries(source, appMap.entries[entry]),
        getFileType(entry)
      ).catch(handleError)
    )
  );
}

/**
 * Creates watches to listen to sources files of appMap description
 * @param {Object} appMap OR filename
 */
function live(appMap, handleError = defaultHandleError) {
  if (typeof appMap === 'string') {
    appMap = readMapFile(appMap);
  }

  let target = appMap.target || '',
    entries = getAbsolutePathes(appMap.source || '', appMap.entries);

  return Promise.all(
    Array.from(entries.keys())
      .map(entry =>
        getWatcherPromises(
          entry,
          entries.get(entry),
          getFileType(entry).handler.mapFile,
          target,
          handleError
        )
      )
      .reduce((acc, promise) => acc.concat(promise), [])
  ).then(watcheArrays =>
    watcheArrays.reduce((acc, watches) => acc.concat(watches), [])
  );
}

class Build {
  constructor() {
    this.handleError = defaultHandleError;
  }

  once(appMap) {
    return once(appMap);
  }

  live(appMap) {
    return live(appMap);
  }

  /** Sets a handler to call upon on error event
   * @param {Function} handler delegate
   */
  onError(handler) {
    this.handleError = handler;
    css.onError(handler);
    html.onError(handler);
    js.onError(handler);
  }

  getFacade() {
    return {
      once: this.once.bind(this),
      live: this.live.bind(this),
      onError: this.onError.bind(this)
    };
  }
}

let build = new Build().getFacade();

export { build as default, once, live };
