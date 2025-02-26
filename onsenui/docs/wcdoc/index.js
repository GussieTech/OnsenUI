var wcdoc = require('wcdoc');
var renderer = require('./renderer');
var fs = require('fs');
var mkpath = require('mkpath');
var resolve = require('path').resolve;
var join = require('path').join;
var validate = require('./validator');

/**
 * @param {Array} docs
 * @return {Array}
 */
function createFileIndex(docs) {
  var fileIndex = {};

  docs.forEach(function(doc) {
    var path = doc.file.relativePath;

    if (!fileIndex[path]) {
      fileIndex[path] = {};
    }

    if (!fileIndex[path][doc.docType]) {
      fileIndex[path][doc.docType] = [];
    }

    const extensionMap = {
      vue: /^\.\.\/vue-onsenui\//,
      angular1: /^bindings\/angular1\//,
      angular2: /^\.\.\/ngx-onsenui\//
    };

    for (const [extension, regex] of Object.entries(extensionMap)) {
      if (regex.test(path)) {
        doc.extensionOf = extension;
        break;
      }
    }

    fileIndex[path][doc.docType].push(doc);
  });

  return fileIndex;
}

/**
 * @param {Array} fileIndex
 * @return {Array}
 */
function createElementIndex(fileIndex) {
  var index = {};

  Object.keys(fileIndex).forEach(function(path) {
    var docdict = fileIndex[path];

    if (docdict.element) {
      var element = docdict.element[0];
      if (!index.hasOwnProperty(element.name)) {
        index[element.name] = [];
      }
      index[element.name].push(docdict);
    }
  });


  var elementIndex = {};
  Object.keys(index).forEach(function(elementName) {
    var docdict = mergeDocdict(index[elementName]);
    var element = docdict.element.find(function(element) {
      return !element.extensionOf;
    }) || docdict.element[0];

    elementIndex[elementName] = renderer.renderElement({
      main: element,
      elements: docdict.element.filter(function(extraElement) {
        return extraElement !== element;
      }),
      attributes: docdict.attribute || [],
      methods: docdict.method || [],
      events: docdict.event || [],
      properties: docdict.property || [],
      inputs: docdict.input || [],
      outputs: docdict.output || [],
    });
  });

  return elementIndex;
}

/**
 * @param {Array} fileIndex
 * @return {Array}
 */
function createObjectIndex(fileIndex) {
  var index = {};

  Object.keys(fileIndex).forEach(function(path) {
    var docdict = fileIndex[path];

    if (docdict.object) {
      var object = docdict.object[0];
      if (!index.hasOwnProperty(object.name)) {
        index[object.name] = [];
      }

      index[object.name].push(docdict);
    }
  });

  var objectIndex = {};
  Object.keys(index).forEach(function(objectName) {

    var docdict = mergeDocdict(index[objectName]);

    var object = docdict.object.find(function(object) {
      return !object.extensionOf;
    }) || docdict.object[0];

    objectIndex[objectName] = renderer.renderObject({
      main: object,
      objects: docdict.object.filter(function(extraObject) {
        return object !== extraObject;
      }),
      methods: docdict.method || [],
      events: docdict.event || [],
      properties: docdict.property || []
    });
  });

  return objectIndex;
}

function mergeDocdict(docdicts) {
  return docdicts.reduce(function(result, docdict) {
    Object.keys(docdict).forEach(function(key) {
      if (!result[key]) {
        result[key] = docdict[key];
      } else {
        result[key] = result[key].concat(docdict[key]);
      }
    });

    return result;
  }, {});
}

function mkdir(path) {
  return new Promise(function(resolve, reject) {
    mkpath(path, function(error) {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

function writeIndex(dir, docIndex) {
  return mkdir(dir).then(function() {
    return Promise.all(Object.keys(docIndex).map(function(key) {
      return new Promise(function(resolve, reject) {
        var doc = docIndex[key];
        var path = join(dir, doc.name + '.json');

        fs.writeFile(path, JSON.stringify(doc, null, '  '), function(error) {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }))
  });
}

function validateIndex(docIndex, schema) {
  Object.keys(docIndex).forEach(function(key) {
    validate(docIndex[key], schema).errors.forEach(function(error) {
      console.log(docIndex[key]);
      console.log(error);
      throw error;
    });
  });
}

/**
 * @param {string} params.src
 * @return {Promise}
 */
function collect(params) {
  return wcdoc.run({
    src: params.src,
    basePath: __dirname + '/../../',
    espreeConfig: {
      ecmaVersion: 8
    }
  }).then(function(result) {

    var fileIndex = createFileIndex(result);
    var elementIndex = createElementIndex(fileIndex);
    var objectIndex = createObjectIndex(fileIndex);

    validateIndex(elementIndex, {$ref: '/element'});
    validateIndex(objectIndex, {$ref: '/object'});

    return {
      element: elementIndex,
      object: objectIndex
    };
  });
}

/**
 * @param {string} out
 * @return {Promise}
 */
function build(out) {
  out = resolve(out);
  return collect({
    src: [
      './esm/elements/**/*.js',
      './esm/ons/**/*.js',
      './bindings/angular1/directives/*.js',
      './bindings/angular1/js/*.js',
      '../ngx-onsenui/projects/ngx-onsenui/src/lib/directives/*.ts',
      '../vue-onsenui/src/docs/*.wcdoc',
      '!**/*.spec.js'
    ]
  }).then(function(result) {
    return writeIndex(join(out, 'object'), result.object).then(function() {
      return writeIndex(join(out, 'element'), result.element);
    });
  }).catch(function(reason) {
    console.log(reason);
    console.log(reason.stack);
    throw reason;
  });
}

module.exports = {
  createFileIndex: createFileIndex,
  createElementIndex: createElementIndex,
  createObjectIndex: createObjectIndex,
  mergeDocdict: mergeDocdict,
  mkdir: mkdir,
  writeIndex: writeIndex,
  validateIndex: validateIndex,
  collect: collect,
  build: build,
};
