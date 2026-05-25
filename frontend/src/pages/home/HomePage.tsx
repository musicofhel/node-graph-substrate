import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { API_BASE } from "../../lib/api";

export default function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState("Loading workspace...");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let graphId = searchParams.get("graph");
      if (!graphId) {
        graphId = localStorage.getItem("substrate:lastGraphId");
      }

      if (graphId) {
        try {
          const resp = await fetch(`${API_BASE}/api/graphs/${graphId}`);
          if (cancelled) return;
          if (resp.ok) {
            const data = await resp.json();
            const projectId = data.project_id;
            navigate(`/p/${projectId}/c/${graphId}`, { replace: true });
            return;
          }
        } catch {}
        localStorage.removeItem("substrate:lastGraphId");
      }

      if (cancelled) return;
      setStatus("Creating default workspace...");

      try {
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

        localStorage.setItem("substrate:lastGraphId", graph.id);
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
