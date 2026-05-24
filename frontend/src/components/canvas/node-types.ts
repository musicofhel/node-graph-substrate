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
import { ResearchBridgeNode } from "../nodes/ResearchBridgeNode";
import { PipelineGroupNode } from "../nodes/PipelineGroupNode";
import { R2BridgeNode } from "../nodes/R2BridgeNode";
import { R2CoordinatorNode } from "../nodes/R2CoordinatorNode";
import { R2StatsNode } from "../nodes/R2StatsNode";
import { R2AutoRelNode } from "../nodes/R2AutoRelNode";
import { R2StateNode } from "../nodes/R2StateNode";
import { DriftMatrixNode } from "../nodes/DriftMatrixNode";
import { BreathingHeatmapNode } from "../nodes/BreathingHeatmapNode";
import { H1LoopNode } from "../nodes/H1LoopNode";

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
  research_bridge: ResearchBridgeNode,
  lf_pipeline_group: PipelineGroupNode,
  r2_bridge: R2BridgeNode,
  r2_coordinator: R2CoordinatorNode,
  r2_stats: R2StatsNode,
  r2_autorel: R2AutoRelNode,
  r2_state: R2StateNode,
  drift_matrix: DriftMatrixNode,
  breathing_heatmap: BreathingHeatmapNode,
  h1_loop: H1LoopNode,
};
