import { type NodeTypes } from "@xyflow/react";
import { PromptInputNode } from "../nodes/PromptInputNode";
import { FeatureBarsNode } from "../nodes/FeatureBarsNode";
import { HiddenStateCloudNode } from "../nodes/HiddenStateCloudNode";
import { PersistenceDiagramNode } from "../nodes/PersistenceDiagramNode";
import { ConfidenceGaugeNode } from "../nodes/ConfidenceGaugeNode";
import { BridgeMonitorNode } from "../nodes/BridgeMonitorNode";
import { ExplainWaterfallNode } from "../nodes/ExplainWaterfallNode";
import { LfStageCard } from "../nodes/LfStageCard";
import { LfCoordinatorNode } from "../nodes/LfCoordinatorNode";
import { LfStatsNode } from "../nodes/LfStatsNode";
import { LfAutoRelNode } from "../nodes/LfAutoRelNode";
import { ResearchCoordinatorNode } from "../nodes/ResearchCoordinatorNode";

export const nodeTypes: NodeTypes = {
  prompt_input: PromptInputNode,
  feature_bars: FeatureBarsNode,
  hidden_state_cloud: HiddenStateCloudNode,
  persistence_diagram: PersistenceDiagramNode,
  confidence_gauge: ConfidenceGaugeNode,
  bridge_monitor: BridgeMonitorNode,
  explain_waterfall: ExplainWaterfallNode,
  lf_stage: LfStageCard,
  lf_coordinator: LfCoordinatorNode,
  lf_stats: LfStatsNode,
  lf_autorel: LfAutoRelNode,
  research_coordinator: ResearchCoordinatorNode,
};
