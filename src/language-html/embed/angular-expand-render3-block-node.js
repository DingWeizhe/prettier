import { htmlAstToRender3Ast, makeBindingParser } from "angular-html-parser";

export function expandAngularRender3Node(node) {
  const nonExpandedBlock = node.children?.find(
    (node) =>
      node.type === "block" && node.__angular_render3_block_node === undefined,
  );

  if (!nonExpandedBlock) return;
  const bindingParser = makeBindingParser();
  const render3 = htmlAstToRender3Ast(node.children, bindingParser, {});
  expandAngularRender3NodeChildren(node.children, render3.nodes);
}

function expandAngularRender3NodeChildren(nodes, render3Nodes) {
  nodes.map((node, index) => {
    if (node.type !== "block") return;

    // In html node, if and else will be divided into two blocks, but in Render3, they will be one group.
    // Therefore, need to find the corresponding Render3 node by whether the offset is between.
    const matchedRender3Nodes = render3Nodes.filter((r3Node) =>
      sourceSpanOffsetInclude(r3Node, node),
    );

    if (matchedRender3Nodes.length != 1) {
      return;
    }

    const render3Node = matchedRender3Nodes[0];
    node.__angular_render3_block_node = render3Node;

    if (!node.children) return;
    const children = [
      // switch
      ...(render3Node.cases ?? []),
      ...(render3Node.unknownBlocks ?? []),
      // if
      ...(render3Node.branches ?? []),
      // case / defer
      ...(render3Node.children ?? []),
      // if / switch
      render3Node.expression ?? undefined,
      // defer
      render3Node.placeholder ?? undefined,
      render3Node.loading ?? undefined,
      render3Node.error ?? undefined,
    ].filter(Boolean);

    if (children.length === 0) {
      return;
    }

    expandAngularRender3NodeChildren(node.children, children);
  });
}

export function sourceSpanOffsetInclude(a, b) {
  const aStart = a.sourceSpan.start.offset;
  const aEnd = a.sourceSpan.end.offset;
  const bStart = b.sourceSpan.start.offset;
  const bEnd = b.sourceSpan.end.offset;
  return aStart <= bStart && bEnd <= aEnd;
}
