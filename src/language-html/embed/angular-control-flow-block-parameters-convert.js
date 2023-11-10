import {
  group,
  hardline,
  indent,
  softline,
  line,
} from "../../document/builders.js";
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
import { sourceSpanOffsetInclude } from "./angular-expand-render3-block-node.js";
import { DOC_TYPE_GROUP } from "../../document/constants.js";

async function parseParameterDocs(node, options) {
  if (node.__angular_render3_block_node) {
    const parameterParser = fetchParamentParser(node);
    try {
      const docs = parameterParser(node);
      return await convertDocs(docs, node, options);
    } catch (error) {
      console.log(error);
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

function fetchParamentParser(node) {
  switch (node.name) {
    case "if":
    case "else if":
      return parseIfBlockParams;

    case "switch":
    case "case":
      return parseSwitchCaseBlockParams;

    case "for":
      return parseForEachBlockParams;

    case "defer":
      return parseDeferParamsParams;

    case "placeholder":
      return parseDeferPlaceholderParams;

    case "loading":
      return parseDeferLoadingParams;
  }
}

async function convertDocs(raws, node, oriOptions) {
  if (!raws.length) return [];

  const context = new Context(node.sourceSpan.start.file.content);
  let docs = [];

  for (let i = 0; i < raws.length; i++) {
    const raw = raws[i];
    if (raw instanceof Array) {
      docs.push(await convertDocs(raw, node, oriOptions));
      continue;
    }

    if (raw.type === DOC_TYPE_GROUP && raw.contents.length) {
      docs.push(group(await convertDocs(raw.contents, node, oriOptions)));
      continue;
    }

    if (raw instanceof AngularAst) {
      const options = await normalizeFormatOptions({
        ...oriOptions,
        filepath: undefined,
        parser: "__ng_directive",
        astFormat: "estree",
      });

      const doc = await printAstToDoc(
        new Node({ type: "NGRoot", node: transform(raw.ast, context) }),
        options,
      );
      docs.push(doc);
    }

    docs.push(raw);
  }

  docs = docs.flat(Infinity).filter(Boolean);
  return docs;
}

function parseSwitchCaseBlockParams(node) {
  return [new AngularAst(node.__angular_render3_block_node.expression.ast)];
}

function parseDeferPlaceholderParams(node) {
  if (node.__angular_render3_block_node.minimumTime) {
    return ["minimum ", parseTimeUnit(loading.minimumTime)];
  } else {
    return [];
  }
}

function parseDeferLoadingParams(node) {
  let docs = [];
  const loading = node.__angular_render3_block_node.loading;
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
  const variables = Object.values(
    node.__angular_render3_block_node.contextVariables,
  ).filter((v) => v.name !== v.value);

  const variablesGroup = Object.keys(variables).length
    ? group([
        "let " + variables.map((v) => v.name + " = " + v.value).join(", "),
      ])
    : undefined;

  return [
    group([
      node.__angular_render3_block_node.item.name + " of ",
      new AngularAst(node.__angular_render3_block_node.expression.ast),
      ";",
      line,
    ]),
    ...(node.__angular_render3_block_node.trackBy
      ? [
          group([
            "track ",
            new AngularAst(node.__angular_render3_block_node.trackBy.ast),
          ]),
          ";",
          line,
        ]
      : []),
    variablesGroup,
  ].filter(Boolean);
}

function parseIfBlockParams(node) {
  if (!node.__angular_render3_block_node.branches) return;

  const branch = node.__angular_render3_block_node.branches.find((branch) =>
    sourceSpanOffsetInclude(branch, node),
  );

  return [
    new AngularAst(branch.expression.ast),
    branch.expressionAlias ? "; as " + branch.expressionAlias.value : undefined,
  ].filter(Boolean);
}

function parseDeferParamsParams(node) {
  const docs = Object.entries(node.__angular_render3_block_node.triggers)
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
          return ["when ", new AngularAst(value.value.ast)];

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

class AngularAst {
  constructor(ast) {
    this.type = DOC_TYPE_GROUP;
    this.ast = ast;
    this.contents = [];
    this.id = undefined;
    this.break = false;
    this.expandedStates = undefined;
  }
}

export default parseParameterDocs;
