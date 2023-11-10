import { group, hardline, indent, softline } from "../../document/builders.js";
import { printChildren } from "../print/children.js";
import {
  formatAttributeValue,
  printExpand,
  shouldHugJsExpression,
} from "./utils.js";
import { printAstToDoc } from "../../main/ast-to-doc.js";
import normalizeFormatOptions from "../../main/normalize-format-options.js";
import { transform } from "angular-estree-parser/lib/transform.js";
import { Context } from "angular-estree-parser/lib/context.js";
import { Node } from "../ast.js";
import { sourceSpanOffsetInclude } from "../merge-block-r3-node.js";
import { DOC_TYPE_GROUP } from "../../document/constants.js";

let uid = 0;

const settings = new Map([
  [
    "if",
    {
      parameterParser: parseIfBlockParams,
      shouldParameters: true,
      isFollowingBlock: false,
      followingBlocks: ["else if", "else"],
    },
  ],
  [
    "else if",
    {
      parameterParser: parseIfBlockParams,
      shouldParameters: true,
      isFollowingBlock: true,
      followingBlocks: ["else if", "else"],
    },
  ],
  [
    "else",
    {
      parameterParser: parseIfBlockParams,
      isFollowingBlock: true,
      followingBlocks: [],
    },
  ],

  [
    "switch",
    {
      parameterParser: parseSwitchCaseBlockParams,
      isFollowingBlock: false,
      followingBlocks: [],
    },
  ],
  [
    "case",
    {
      parameterParser: parseSwitchCaseBlockParams,
      shouldParameters: true,
      isFollowingBlock: false,
      followingBlocks: [],
    },
  ],
  [
    "default",
    {
      isFollowingBlock: false,
      followingBlocks: [],
    },
  ],

  [
    "for",
    {
      parameterParser: parseForEachBlockParams,
      shouldParameters: true,
      isFollowingBlock: false,
      followingBlocks: ["empty"],
    },
  ],
  [
    "empty",
    {
      isFollowingBlock: true,
      followingBlocks: [],
    },
  ],

  [
    "defer",
    {
      parameterParser: parseDeferParamsParams,
      isFollowingBlock: false,
      followingBlocks: ["placeholder", "error", "loading"],
    },
  ],
  [
    "placeholder",
    {
      parameterParser: parseDeferPlaceholderParams,
      isFollowingBlock: true,
      followingBlocks: ["placeholder", "error", "loading"],
    },
  ],
  [
    "error",
    {
      isFollowingBlock: true,
      followingBlocks: ["placeholder", "error", "loading"],
    },
  ],
  [
    "loading",
    {
      parameterParser: parseDeferLoadingParams,
      isFollowingBlock: true,
      followingBlocks: ["placeholder", "error", "loading"],
    },
  ],
]);

function printBlock(path, options, print) {
  return _printBlock;
}

async function _printBlock(textToDoc, print, path, options) {
  const node = path.node;
  const type = normalizeName(node.name);
  const setting = settings.get(type);
  const docs = [];

  if (!setting) {
    throw new Error("Unknown block name: " + node.name);
  }

  if (
    setting.isFollowingBlock &&
    path.previous &&
    path.previous.type === "block"
  ) {
    docs.push("} ");
  }

  docs.push("@", type);

  if (node.parameters.length || setting.shouldParameters) {
    const parameters = await parseParameterDocs(type, node, setting, options);
    docs.push(` (`, parameters, `)`);
  }

  docs.push(" {");

  const children = printChildren(path, options, print);
  docs.push(indent([hardline, children]));

  if (shouldCloseBlock(node, setting.followingBlocks)) {
    docs.push(hardline, "}");
  }

  return group(docs, {
    id: Symbol("block-" + ++uid),
    shouldBreak: true,
  });
}

function shouldCloseBlock(node, names) {
  return (
    names.length === 0 ||
    !node.next ||
    !names.includes(normalizeName(node.next.name))
  );
}

async function parseParameterDocs(type, node, setting, options) {
  if (node.r3Node && setting.parameterParser) {
    try {
      const astAndDocs = setting.parameterParser(node);
      return await convertNgAstsToDocs(astAndDocs, node, options);
    } catch (error) {
      // ignore, use plainText
    }
  }

  const expressions = [];

  for (let param of node.parameters) {
    const expression = param.expression;
    expressions.push(expression, "; ");
  }

  // Remove the last ;
  if (expressions[expressions.length - 1] === "; ") {
    expressions.pop();
  }

  const plainText = expressions.join("");
  return plainText;
}

async function convertNgAstsToDocs(ngAsts, node, options) {
  if (!ngAsts.length) throw new Error("No ngAst found");

  const context = new Context(node.sourceSpan.start.file.content);
  let docs = [];

  const _options = await normalizeFormatOptions({
    ...options,
    filepath: undefined,
    parser: "__ng_directive",
    astFormat: "estree",
  });

  for (let i = 0; i < ngAsts.length; i++) {
    const ngAst = ngAsts[i];
    if (typeof ngAst === "string") {
      docs.push(ngAst);
      continue;
    }

    if (ngAst instanceof Array) {
      docs.push(await convertNgAstsToDocs(ngAst, node, options));
      continue;
    }

    if (ngAst.type === "group") {
      docs.push(
        group(await convertNgAstsToDocs(ngAst.contents, node, options)),
      );
      continue;
    }

    let doc = await printAstToDoc(
      new Node({ type: "NGRoot", node: transform(ngAst, context) }),
      _options,
    );

    docs.push(doc);
  }

  docs = docs.flat(Infinity).filter(Boolean);
  return docs;
}

function parseSwitchCaseBlockParams(node) {
  return [node.r3Node.expression.ast];
}

function parseDeferPlaceholderParams(node) {
  if (node.r3Node.minimumTime) {
    return ["minimum ", parseTimeUnit(loading.minimumTime)];
  } else {
    return [];
  }
}

function parseDeferLoadingParams(node) {
  let docs = [];
  const loading = node.r3Node.loading;
  if (loading.afterTime) {
    docs.push(["after ", parseTimeUnit(loading.afterTime)]);
  }

  if (loading.minimumTime) {
    docs.push(["minimum ", parseTimeUnit(loading.minimumTime)]);
  }

  docs = docs.reduce((acc, cur) => acc.concat([...cur, "; "]), []);

  if (docs[docs.length - 1] === "; ") {
    docs.pop();
  }

  return docs;
}

function parseForEachBlockParams(node) {
  const variables = Object.values(node.r3Node.contextVariables).filter(
    (v) => v.name !== v.value,
  );

  const variablesDocs = Object.keys(variables).length
    ? [
        "; ",
        softline,
        ngGroup([
          "let " + variables.map((v) => v.name + " = " + v.value).join(", "),
        ]),
      ]
    : [];

  return [
    node.r3Node.item.name + " of ",
    node.r3Node.expression.ast,
    softline,
    ...(node.r3Node.trackBy
      ? ["; ", ngGroup(["track ", node.r3Node.trackBy.ast]), softline]
      : []),
    ...variablesDocs,
  ].filter(Boolean);
}

function parseIfBlockParams(node) {
  if (!node.r3Node.branches) return;

  const branch = node.r3Node.branches.find((branch) =>
    sourceSpanOffsetInclude(branch, node),
  );

  return [
    branch.expression.ast,
    branch.expressionAlias ? "; as " + branch.expressionAlias.value : undefined,
  ].filter(Boolean);
}

function parseDeferParamsParams(node) {
  const docs = Object.entries(node.r3Node.triggers)
    .map(([type, value]) => {
      switch (type) {
        case "idle":
          return ["on idle"];

        case "viewport":
        case "interaction":
        case "hover":
          if (value.reference) {
            return [`on ${type}(${value.reference})`];
          } else {
            return [`on ${type}`];
          }

        case "timer":
          return [`on timer(${parseTimeUnit(value.delay)})`];

        case "immediate":
          return ["on immediate"];

        case "when":
          return ["when ", value.value.ast];

        default:
          console.log("Unknown trigger: " + type, value);
      }
    })
    .reduce((acc, cur) => acc.concat([...cur, "; "]), []);

  if (docs[docs.length - 1] === "; ") {
    docs.pop();
  }

  return docs;
}

function parseTimeUnit(time) {
  if (time % 100 === 0) {
    return time / 1000 + "s";
  } else {
    return time + "ms";
  }
}

function normalizeName(name) {
  return name.toLowerCase().replace(/\s+/gi, " ").trim();
}

let ngAstGroupUid = 0;

function ngGroup(contents) {
  return {
    type: DOC_TYPE_GROUP,
    id: Symbol("ng-ast-group-" + ++ngAstGroupUid),
    contents,
    break: false,
    expandedStates: undefined,
  };
}

export default printBlock;
