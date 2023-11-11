import isFrontMatter from "../utils/front-matter/is-front-matter.js";
import { ANGULAR_CONTROL_FLOW_BLOCK_WITH_PARAMETERS } from "./print/angular-control-flow-block-settings.evaluate.js";

const ignoredProperties = new Set([
  "sourceSpan",
  "startSourceSpan",
  "endSourceSpan",
  "nameSpan",
  "valueSpan",
  "keySpan",
  "tagDefinition",
  "tokens",
  "valueTokens",
]);

function clean(ast, newNode) {
  if (ast.type === "text" || ast.type === "comment") {
    return null;
  }

  // may be formatted by multiparser
  if (isFrontMatter(ast) || ast.type === "yaml" || ast.type === "toml") {
    return null;
  }

  if (ast.type === "attribute") {
    delete newNode.value;
  }

  if (ast.type === "docType") {
    delete newNode.value;
  }

  if (ast.type === "block") {
    // Block names that can have parameters
    const isEmbed = ANGULAR_CONTROL_FLOW_BLOCK_WITH_PARAMETERS.has(ast.name);
    for (const parameter of newNode.parameters) {
      if (isEmbed) {
        delete parameter.expression;
      } else {
        parameter.expression = parameter.expression.trim();
      }
    }
  }
}

clean.ignoredProperties = ignoredProperties;

export default clean;
