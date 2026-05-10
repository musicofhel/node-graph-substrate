import React, { memo } from "react";
import { useNodesData } from "@xyflow/react";

const STAGE_CATEGORIES: Record<string, string> = {
  ingested: "input",
  extracted: "extraction",
  categorized: "extraction",
  embedded: "topology",
  stored: "topology",
  chunked: "topology",
  auto_related: "scoring",
  research_bridged: "scoring",
  url_discovered: "extraction",
  completed: "scoring",
};

const STAGE_LABELS: Record<string, string> = {
  ingested: "Ingested",
  extracted: "Extracted",
  categorized: "Categorized",
  embedded: "Embedded",
  stored: "Stored",
  chunked: "Chunked",
  auto_related: "Auto Related",
  research_bridged: "Research Bridge",
  url_discovered: "URLs Discovered",
  completed: "Completed",
};

const CATEGORY_BORDER: Record<string, string> = {
  input: "border-amber-700",
  extraction: "border-blue-700",
  topology: "border-cyan-700",
  scoring: "border-emerald-700",
};

function forgeScoreColor(score: number): string {
  if (score >= 0.65) return "text-green-400";
  if (score >= 0.45) return "text-yellow-400";
  if (score >= 0.25) return "text-orange-400";
  return "text-red-400";
}

function IngestedContent({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-0.5 text-[10px] text-neutral-400">
      <div className="truncate">{String(data.url ?? "")}</div>
      <div>{String(data.source_type ?? "")} / {String(data.source ?? "")}</div>
    </div>
  );
}

function ExtractedContent({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-0.5 text-[10px] text-neutral-400">
      <div className="truncate font-medium text-neutral-200">{String(data.title ?? "")}</div>
      <div>{String(data.domain ?? "")} &middot; {String(data.content_length ?? 0)} chars</div>
    </div>
  );
}

function CategorizedContent({ data }: { data: Record<string, unknown> }) {
  const score = Number(data.forge_score ?? 0);
  return (
    <div className="space-y-0.5 text-[10px] text-neutral-400">
      <div className="flex items-center gap-1">
        <span className="rounded bg-neutral-800 px-1 py-0.5">{String(data.category ?? "")}</span>
        <span className={forgeScoreColor(score)}>{score.toFixed(2)}</span>
      </div>
      <div>{String(data.content_type ?? "")}</div>
    </div>
  );
}

function EmbeddedContent({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="text-[10px] text-neutral-400">
      {String(data.embedding_dim ?? 0)}-dim vector
    </div>
  );
}

function StoredContent({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="text-[10px] text-neutral-400">
      {String(data.tag_count ?? 0)} tags &middot; {String(data.tool_count ?? 0)} tools &middot; {String(data.concept_count ?? 0)} concepts
    </div>
  );
}

function ChunkedContent({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="text-[10px] text-neutral-400">
      {String(data.chunk_size ?? 0)} chunks &middot; {String(data.coverage_pct ?? 0)}% coverage
    </div>
  );
}

function AutoRelatedContent({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-0.5 text-[10px] text-neutral-400">
      <div>{String(data.match_count ?? 0)} matches</div>
      {typeof data.best_match_title === "string" && data.best_match_title && (
        <div className="truncate">best: {data.best_match_title}</div>
      )}
    </div>
  );
}

function ResearchBridgedContent({ data }: { data: Record<string, unknown> }) {
  const relevant = data.research_relevant === true || data.research_relevant === "true";
  return (
    <div className="text-[10px] text-neutral-400">
      {relevant ? (
        <span className="text-emerald-400">{String(data.arxiv_id ?? "research")}</span>
      ) : (
        <span>not research</span>
      )}
    </div>
  );
}

function UrlDiscoveredContent({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="text-[10px] text-neutral-400">
      {String(data.urls_found ?? 0)} found &middot; {String(data.urls_enqueued ?? 0)} enqueued
    </div>
  );
}

function CompletedContent({ data }: { data: Record<string, unknown> }) {
  const success = data.success === true || data.success === "true";
  return (
    <div className="text-[10px]">
      {success ? (
        <span className="text-emerald-400">{String(data.processing_time_ms ?? 0)}ms</span>
      ) : (
        <span className="text-red-400 truncate">{String(data.error ?? "failed")}</span>
      )}
    </div>
  );
}

const STAGE_RENDERERS: Record<string, (props: { data: Record<string, unknown> }) => React.ReactNode> = {
  ingested: IngestedContent,
  extracted: ExtractedContent,
  categorized: CategorizedContent,
  embedded: EmbeddedContent,
  stored: StoredContent,
  chunked: ChunkedContent,
  auto_related: AutoRelatedContent,
  research_bridged: ResearchBridgedContent,
  url_discovered: UrlDiscoveredContent,
  completed: CompletedContent,
};

export const LfStageCard = memo(({ id }: { id: string }) => {
  const nodeData = useNodesData(id);
  const data = (nodeData?.data ?? {}) as Record<string, unknown>;
  const stage = String(data._stage ?? "ingested");
  const category = STAGE_CATEGORIES[stage] ?? "scoring";
  const borderClass = CATEGORY_BORDER[category] ?? "border-neutral-700";
  const label = STAGE_LABELS[stage] ?? stage;

  const failed = stage === "completed" && data.success !== true && data.success !== "true";
  const borderOverride = failed ? "border-red-700" : borderClass;

  const Renderer = STAGE_RENDERERS[stage];

  return (
    <div className={`w-[210px] rounded border ${borderOverride} bg-neutral-900 shadow-md`}>
      <div className="border-b border-neutral-800 px-2 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-300">
          {label}
        </span>
      </div>
      <div className="px-2 py-1.5">
        {Renderer ? <Renderer data={data} /> : null}
      </div>
    </div>
  );
});
LfStageCard.displayName = "LfStageCard";
