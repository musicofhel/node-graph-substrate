export interface PackError {
  packId: string;
  message: string;
}

export default function PackRegistryErrorPage({
  errors,
}: {
  errors: PackError[];
}) {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-6 bg-[#0a0a0a] text-neutral-300">
      <h1 className="text-lg font-medium">Pack Registry Error</h1>
      <p className="max-w-md text-center text-sm text-neutral-500">
        One or more packs failed to load. Review the errors below.
      </p>
      <ul className="max-w-lg space-y-2">
        {errors.map((e) => (
          <li
            key={e.packId}
            className="rounded border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm"
          >
            <span className="font-mono text-amber-400">{e.packId}</span>
            <span className="text-neutral-500"> — </span>
            <span>{e.message}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={() => window.location.reload()}
        className="rounded bg-neutral-800 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
      >
        Reload
      </button>
    </div>
  );
}
