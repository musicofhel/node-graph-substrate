import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { API_BASE } from "../../lib/api";
import { useSessionStore } from "../../features/workspace/useProjectSession";

export default function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("Loading workspace...");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const graphParam = searchParams.get("graph");
      if (graphParam) {
        try {
          const resp = await fetch(`${API_BASE}/api/graphs/${graphParam}`);
          if (cancelled) return;
          if (resp.ok) {
            const data = await resp.json();
            navigate(`/p/${data.project_id}/c/${graphParam}`, { replace: true });
            return;
          }
        } catch {}
      }

      if (cancelled) return;
      setStatus("Loading workspace...");

      try {
        // POST is idempotent — returns existing project if slug matches
        const projResp = await fetch(`${API_BASE}/api/projects`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: "default",
            display_name: "Default Project",
          }),
        });
        if (cancelled) return;
        const proj = await projResp.json();

        await useSessionStore.getState().hydrate(proj.id);
        if (cancelled) return;
        const session = useSessionStore.getState();

        if (session.activeCanvasId) {
          navigate(`/p/${proj.id}/c/${session.activeCanvasId}`, { replace: true });
          return;
        }

        // No active session — find or create a graph
        const graphsResp = await fetch(`${API_BASE}/api/projects/${proj.id}/graphs`);
        if (cancelled) return;
        if (graphsResp.ok) {
          const graphs = await graphsResp.json();
          if (graphs.length > 0) {
            navigate(`/p/${proj.id}/c/${graphs[0].id}`, { replace: true });
            return;
          }
        }

        // No graphs exist — create default
        const graphResp = await fetch(`${API_BASE}/api/graphs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: proj.id,
            name: "Pipeline",
          }),
        });
        if (cancelled) return;
        const graph = await graphResp.json();

        navigate(`/p/${proj.id}/c/${graph.id}`, { replace: true });
      } catch (e) {
        if (!cancelled) setStatus("Failed to connect to server. Is it running on port 8080?");
      }
    })();

    return () => { cancelled = true; };
  }, [navigate, searchParams]);

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-neutral-500">{status}</p>
    </div>
  );
}
