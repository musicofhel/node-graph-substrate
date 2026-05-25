import { Command } from "cmdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useGlobalSearch, type SearchResult } from "./useGlobalSearch";

const KIND_LABELS: Record<string, string> = {
  project: "Projects",
  canvas: "Canvases",
  run: "Runs",
  node: "Nodes on Canvas",
};

const KIND_ICONS: Record<string, string> = {
  project: "P",
  canvas: "C",
  run: "R",
  node: "N",
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { query, setQuery, results, isFetching } = useGlobalSearch();
  const modifierRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.metaKey || e.ctrlKey) modifierRef.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) modifierRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const handleSelect = useCallback(
    (value: string) => {
      const result = results.find((r) => `${r.kind}-${r.id}` === value);
      if (!result?.url) return;

      if (modifierRef.current) {
        window.open(result.url, "_blank");
      } else {
        navigate(result.url);
      }
      setOpen(false);
      setQuery("");
    },
    [results, navigate, setQuery],
  );

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.kind] ??= []).push(r);
    return acc;
  }, {});

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery("");
      }}
      label="Global search"
      overlayClassName="fixed inset-0 z-[100] bg-black/60"
      contentClassName="fixed left-1/2 top-[20%] z-[101] w-full max-w-lg -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-900 shadow-2xl"
    >
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder="Search projects, canvases, nodes..."
        className="w-full border-b border-neutral-700 bg-transparent px-4 py-3 text-sm text-neutral-200 outline-none placeholder:text-neutral-500"
      />
      <Command.List className="max-h-72 overflow-y-auto p-2">
        <Command.Empty className="px-4 py-8 text-center text-sm text-neutral-500">
          {isFetching ? "Searching..." : "No results found."}
        </Command.Empty>

        {(["project", "canvas", "run", "node"] as const).map((kind) => {
          const items = grouped[kind];
          if (!items?.length) return null;
          return (
            <Command.Group
              key={kind}
              heading={KIND_LABELS[kind]}
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-neutral-500"
            >
              {items.map((r) => (
                <Command.Item
                  key={`${r.kind}-${r.id}`}
                  value={`${r.kind}-${r.id}`}
                  onSelect={handleSelect}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-neutral-300 aria-selected:bg-neutral-800 aria-selected:text-white"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-neutral-800 text-[10px] font-bold text-neutral-400">
                    {KIND_ICONS[r.kind]}
                  </span>
                  <span className="flex-1 truncate">{r.label}</span>
                  {r.sublabel && (
                    <span className="shrink-0 text-xs text-neutral-500">
                      {r.sublabel}
                    </span>
                  )}
                </Command.Item>
              ))}
            </Command.Group>
          );
        })}
      </Command.List>
    </Command.Dialog>
  );
}
