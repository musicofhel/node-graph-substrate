import { type NodeTypes } from "@xyflow/react";
import { CounterNode } from "../nodes/CounterNode";
import { PromptInputNode } from "../nodes/PromptInputNode";
import { FeatureBarsNode } from "../nodes/FeatureBarsNode";

export const nodeTypes: NodeTypes = {
  counter: CounterNode,
  prompt_input: PromptInputNode,
  feature_bars: FeatureBarsNode,
};
