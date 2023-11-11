import { formatAttributeValue } from "./utils.js";
import {
  expandAngularRender3Node,
  sourceSpanOffsetInclude,
} from "./angular-expand-render3-block-node.js";
import { group, line } from "../../document/builders.js";
import { printAstToDoc } from "../../main/ast-to-doc.js";
import normalizeFormatOptions from "../../main/normalize-format-options.js";
import { transform } from "angular-estree-parser/lib/transform.js";
import { Context } from "angular-estree-parser/lib/context.js";
import { Node } from "../ast.js";
import { DOC_TYPE_GROUP } from "../../document/constants.js";

async function printAngularControlFlowBlockParameters(
  textToDoc,
  print,
  path,
  options,
) {
  const { node, parent } = path;

  if (!node.__angular_render3_block_node) return;
  try {
    const parser = fetchParamentParser(node);
    node.__embed_parameters_doc = await parser(node);
  } catch (error) {
    console.log(error);
    // ignore, use plainText
  }

  return;

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

  async function parseSwitchCaseBlockParams(node) {
    return [
      await printAngularAst(node.__angular_render3_block_node.expression.ast),
    ];
  }

  function parseDeferPlaceholderParams(node) {
    if (node.__angular_render3_block_node.minimumTime) {
      return ["minimum ", timeUnit(loading.minimumTime)];
    } else {
      return [];
    }
  }

  function parseDeferLoadingParams(node) {
    let docs = [];
    const loading = node.__angular_render3_block_node.loading;
    if (loading.afterTime) {
      docs.push(["after ", timeUnit(loading.afterTime)]);
    }

    if (loading.minimumTime) {
      docs.push(["minimum ", timeUnit(loading.minimumTime)]);
    }

    docs = docs.reduce((acc, cur) => acc.concat([...cur, "; "]), []);

    if (docs[docs.length - 1] === "; ") {
      docs.pop();
    }

    return docs;
  }

  async function parseForEachBlockParams(node) {
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
        await printAngularAst(node.__angular_render3_block_node.expression.ast),
        ";",
        line,
      ]),
      ...(node.__angular_render3_block_node.trackBy
        ? [
            group([
              "track ",
              await printAngularAst(
                node.__angular_render3_block_node.trackBy.ast,
              ),
            ]),
            ";",
            line,
          ]
        : []),
      variablesGroup,
    ].filter(Boolean);
  }

  async function parseIfBlockParams(node) {
    if (!node.__angular_render3_block_node.branches) return;

    const branch = node.__angular_render3_block_node.branches.find((branch) =>
      sourceSpanOffsetInclude(branch, node),
    );

    return [
      await printAngularAst(branch.expression.ast),
      branch.expressionAlias
        ? "; as " + branch.expressionAlias.value
        : undefined,
    ].filter(Boolean);
  }

  async function parseDeferParamsParams(node) {
    let docs = [];

    const triggers = Object.entries(node.__angular_render3_block_node.triggers);
    for (const [type, value] of triggers) {
      switch (type) {
        case "idle":
          docs.push(["on idle"]);
          break;

        case "viewport":
        case "interaction":
        case "hover":
          if (value.reference) {
            docs.push([`on ${type}(${value.reference})`]);
          } else {
            docs.push([`on ${type}`]);
          }
          break;

        case "timer":
          docs.push([`on timer(${timeUnit(value.delay)})`]);
          break;

        case "immediate":
          docs.push(["on immediate"]);
          break;

        case "when":
          docs.push(["when ", await printAngularAst(value.value.ast)]);
          break;

        default:
          console.log("Unknown trigger: " + type, value);
      }
    }

    docs = docs.reduce((acc, cur) => acc.concat([...cur, "; "]), []);

    if (docs[docs.length - 1] === "; ") {
      docs.pop();
    }

    return docs;
  }

  function timeUnit(time) {
    if (time % 100 === 0) {
      return time / 1000 + "s";
    } else {
      return time + "ms";
    }
  }

  async function printAngularAst(ast) {
    const context = new Context(node.sourceSpan.fullStart.file.content);

    const astOptions = await normalizeFormatOptions({
      ...options,
      filepath: undefined,
      parser: "__ng_directive",
      astFormat: "estree",
    });

    const doc = await printAstToDoc(
      new Node({ type: "NGRoot", node: transform(ast, context) }),
      astOptions,
    );

    return doc;
  }
}

export default printAngularControlFlowBlockParameters;
