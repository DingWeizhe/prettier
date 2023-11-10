import { htmlAstToRender3Ast, makeBindingParser } from "angular-html-parser";

export function mergeBlockR3Node(node) {
  const unmergedBlock = node.children?.find(
    (node) => node.type === "block" && node.r3Node === undefined,
  );

  if (!unmergedBlock) return;
  const bindingParser = makeBindingParser();
  const result = htmlAstToRender3Ast(node.children, bindingParser, {});
  mergeBlockR3Children(node.children, result.nodes);
}

function mergeBlockR3Children(nodes, r3Nodes) {
  nodes.map((node, index) => {
    if (node.type !== "block") return;

    // In html node, if and else will be divided into two blocks, but in Render3, they will be one group.
    // Therefore, need to find the corresponding Render3 node by whether the offset is between.
    const matchedR3Node = r3Nodes.filter((r3Node) =>
      sourceSpanOffsetInclude(r3Node, node),
    );

    if (matchedR3Node.length != 1) {
      return;
    }

    const r3Node = matchedR3Node[0];
    node.r3Node = r3Node;

    if (!node.children) return;
    const r3Children = [
      // switch
      ...(r3Node.cases ?? []),
      ...(r3Node.unknownBlocks ?? []),
      // if
      ...(r3Node.branches ?? []),
      // case / defer
      ...(r3Node.children ?? []),
      // if / switch
      r3Node.expression ?? undefined,
      // defer
      r3Node.placeholder ?? undefined,
      r3Node.loading ?? undefined,
      r3Node.error ?? undefined,
    ].filter(Boolean);

    if (r3Children.length === 0) {
      return;
    }

    mergeBlockR3Children(node.children, r3Children);
  });
}

export function sourceSpanOffsetInclude(a, b) {
  const aStart = a.sourceSpan.start.offset;
  const aEnd = a.sourceSpan.end.offset;
  const bStart = b.sourceSpan.start.offset;
  const bEnd = b.sourceSpan.end.offset;
  return aStart <= bStart && bEnd <= aEnd;
}
