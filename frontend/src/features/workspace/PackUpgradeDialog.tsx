import { useState, useEffect, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { API_BASE } from "../../lib/api";
import { packManifests } from "../../lib/pack-registry";

interface Props {
  graphId: string;
  pinnedVersions: Record<string, string>;
  open: boolean;
  onClose: () => void;
}

type UpgradeRow = {
  packId: string;
  pinned: string;
  available: string;
  hasUpdate: boolean;
};

function buildRows(pinned: Record<string, string>): UpgradeRow[] {
  return packManifests.map((m) => {
    const pin = pinned[m.id] ?? "0.0.0";
    return {
      packId: m.id,
      pinned: pin,
      available: m.version,
      hasUpdate: m.version !== pin,
    };
  });
}

export function PackUpgradeDialog({ graphId, pinnedVersions, open, onClose }: Props) {
  const [rows, setRows] = useState<UpgradeRow[]>([]);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setRows(buildRows(pinnedVersions));
  }, [pinnedVersions]);

  const hasUpgrades = rows.some((r) => r.hasUpdate);

  const applyUpgrade = useCallback(async () => {
    setApplying(true);
    const newVersions: Record<string, string> = {};
    for (const row of rows) {
      newVersions[row.packId] = row.available;
    }
    try {
      await fetch(`${API_BASE}/api/graphs/${graphId}/pack-upgrade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack_versions: newVersions }),
      });
      onClose();
    } finally {
      setApplying(false);
    }
  }, [rows, graphId, onClose]);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-xl">
          <Dialog.Title className="mb-3 text-sm font-semibold text-neutral-200">
            Pack Versions
          </Dialog.Title>

          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="pb-1.5">Pack</th>
                <th className="pb-1.5">Pinned</th>
                <th className="pb-1.5">Available</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.packId} className="border-t border-neutral-800">
                  <td className="py-1.5 font-medium text-neutral-300">{r.packId}</td>
                  <td className="py-1.5 font-mono text-neutral-400">{r.pinned}</td>
                  <td className={`py-1.5 font-mono ${r.hasUpdate ? "text-sky-400" : "text-neutral-400"}`}>
                    {r.available}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:text-neutral-200"
              >
                Close
              </button>
            </Dialog.Close>
            {hasUpgrades && (
              <button
                type="button"
                disabled={applying}
                onClick={applyUpgrade}
                className="rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-sky-500 disabled:opacity-50"
              >
                {applying ? "Applying..." : "Apply Upgrades"}
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
