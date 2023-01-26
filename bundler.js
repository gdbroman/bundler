const fs = require("fs");
const path = require("path");
const babylon = require("babylon"); // JS parser
const traverse = require("babel-traverse").default; // Helper to traverse AST
const babel = require("@babel/core"); // Transpile code

let ID = 0;

// Figure out the program's dependencies.
function createAsset(fileName) {
  const content = fs.readFileSync(fileName, "utf-8");

  // Abstract syntax tree.
  const ast = babylon.parse(content, {
    sourceType: "module",
  });

  const dependencies = [];

  traverse(ast, {
    ImportDeclaration: ({ node }) => {
      dependencies.push(node.source.value);
    },
  });

  const id = ID++;

  // Transpile each module's code down to CommonJS.
  const { code } = babel.transformFromAst(ast, null, {
    presets: ["@babel/preset-env"],
  });

  return {
    id,
    fileName,
    dependencies,
    code,
  };
}

function creaateGraph(entry) {
  const mainAsset = createAsset(entry);

  const queue = [mainAsset];

  for (const asset of queue) {
    const dirName = path.dirname(asset.fileName);

    asset.mapping = {};

    asset.dependencies.forEach((relativePath) => {
      const absolutePath = path.join(dirName, relativePath);
      const child = createAsset(absolutePath);

      asset.mapping[relativePath] = child.id;

      queue.push(child);
    });
  }

  return queue;
}

function bundle(graph) {
  let modules = "";

  graph.forEach((module) => {
    // CommonJS keywords require, module and exports need to be defined in the function.
    // Also, relative require paths need to be replaced with the module's id.
    modules += `${module.id}: [
      function(require, module, exports) {
        ${module.code}
      },
      ${JSON.stringify(module.mapping)},
    ],`;
  });

  const result = `
    (function(modules) {
      function require(id) {
        const [fn, mapping] = modules[id];

        function localRequire(relativePath) {
          return require(mapping[relativePath]);
        }

        const module = { exports: {} };

        fn(localRequire, module, module.exports);

        return module.exports;
      }

      require(0);
    })({${modules}})
  `;

  return result;
}

const graph = creaateGraph("./example/entry.js");
const result = bundle(graph);

// Save result to file.
fs.writeFileSync("./bundle.js", result);
