import { type NodeTypes } from "@xyflow/react";
import { CounterNode } from "../nodes/CounterNode";
import { PromptInputNode } from "../nodes/PromptInputNode";
import { FeatureBarsNode } from "../nodes/FeatureBarsNode";
import { HiddenStateCloudNode } from "../nodes/HiddenStateCloudNode";
import { PersistenceDiagramNode } from "../nodes/PersistenceDiagramNode";

export const nodeTypes: NodeTypes = {
  counter: CounterNode,
  prompt_input: PromptInputNode,
  feature_bars: FeatureBarsNode,
  hidden_state_cloud: HiddenStateCloudNode,
  persistence_diagram: PersistenceDiagramNode,
};
