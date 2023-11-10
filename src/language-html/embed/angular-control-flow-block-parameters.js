import { formatAttributeValue } from "./utils.js";
import { expandAngularRender3Node } from "./angular-expand-render3-block-node.js";
import parseParameterDocs from "./angular-control-flow-block-parameters-convert.js";

async function printAngularControlFlowBlockParameters(
  textToDoc,
  print,
  path,
  options,
) {
  const { node, parent } = path;

  try {
    const doc = await parseParameterDocs(node, options);
    node.__embed_parameters_doc = doc;
  } catch (error) {}
}

export default printAngularControlFlowBlockParameters;
