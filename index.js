var babel = require("@babel/core");
var types = require("@babel/types");
var traverse = require("@babel/traverse").default;
var generator = require("@babel/generator").default;
var fs = require("fs");
var path = require("path");

var messagesEn;
var messagesEs;

exports.default = function loader(source, options) {
  this.addDependency(path.resolve("./src/i18n/en.json"));
  this.addDependency(path.resolve("./src/i18n/es.json"));
  messagesEn = require(path.resolve("./src/i18n/en.json"));
  messagesEs = require(path.resolve("./src/i18n/es.json"));
  var ast = babel.parseSync(source, {
    presets: ["@babel/preset-react"],
    plugins: ["@babel/plugin-proposal-class-properties"],
  });
  let foundIntl = false;
  let messagesToGet = [];
  function FunctionTraverse(path) {
    let intl = false;
    path.traverse({
      JSXElement(path) {
        //console.log(path.node.openingElement, "this is opening element")
        if (checkIntl(path.node.openingElement)) {
          const replacement = getAttributes(
            path.node.openingElement,
            types.isJSXExpressionContainer(path.parent),
            messagesToGet
          );
          path.replaceWith(replacement);
          intl = true;
        }
      },
    });

    if (intl) {
      prependHook(path);
      foundIntl = true;
    }
  }

  traverse(ast, {
    Program(path) {
      path.traverse({
        FunctionDeclaration: FunctionTraverse,
        ArrowFunctionExpression: FunctionTraverse,
        FunctionExpression: FunctionTraverse,
      });
      if (foundIntl) {
        prependImportStatement(path);
        appenInitStatement(path, messagesToGet);
      }
    },
  });
  const result = generator(ast);
  const file = this.resource.replace(/\//g, "-");
  if (file) fs.writeFileSync("./generated/" + file, result.code);
  this.callback(null, result.code);
};

function checkIntl(node) {
  try {
    if (node.name && node.name.name == "FormattedMessage") {
      return true;
    }
  } catch (e) {
    throw `${e} Error intl`;
  }
}

function getAttributes(node, isParentExpressionContainer, messages) {
  try {
    const idAttribute = node.attributes.filter((attr) => {
      if (
        attr.name &&
        attr.name.name == "id" &&
        attr.value &&
        types.isStringLiteral(attr.value)
      ) {
        return true;
      }
      return false;
    })[0];

    if (idAttribute) {
      const callExpression = types.callExpression(types.identifier("intl"), [
        types.stringLiteral(idAttribute.value.value),
      ]);
      messages.push(idAttribute.value.value);
      if (isParentExpressionContainer) {
        return callExpression;
      }
      return types.jsxExpressionContainer(callExpression);
    }
  } catch (e) {
    throw `${e} This is error`;
  }
}

function prependImportStatement(path) {
  try {
    const importDecl = path
      .get("body")
      .filter((p) => p.isImportDeclaration())
      .pop();
    importDecl.insertAfter(
      types.importDeclaration(
        [
          types.importSpecifier(
            types.identifier("useIntl"),
            types.identifier("useIntl")
          ),
          types.importSpecifier(
            types.identifier("initIntl"),
            types.identifier("initIntl")
          ),
        ],
        types.stringLiteral("../components/useIntl")
      )
    );
  } catch (e) {
    console.log(e, "This is weeoe");
    throw e;
  }
}

function prependHook(path) {
  path.node.body.body.splice(
    0,
    0,
    types.variableDeclaration("var", [
      types.variableDeclarator(
        types.identifier("intl"),
        types.callExpression(types.identifier("useIntl"), [])
      ),
    ])
  );
}

function appenInitStatement(path, messages) {
  path.node.body.push(
    types.callExpression(types.identifier("initIntl"), [
      getMessagesObject(messages),
    ])
  );
}

function getMessagesObject(messages) {
  const keysEn = [];
  const keysEs = [];
  messages.forEach((message) => {
    keysEn.push(
      types.objectProperty(
        types.identifier(message),
        types.stringLiteral(messagesEn[message])
      )
    );
    keysEs.push(
      types.objectProperty(
        types.identifier(message),
        types.stringLiteral(messagesEs[message])
      )
    );
  });

  return types.objectExpression([
    types.objectProperty(
      types.identifier("en"),
      types.objectExpression(keysEn)
    ),
    types.objectProperty(
      types.identifier("es"),
      types.objectExpression(keysEs)
    ),
  ]);
}
