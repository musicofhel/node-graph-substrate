import { Link } from "react-router";

export default function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-neutral-300">
      <h1 className="text-lg font-medium">Page not found</h1>
      <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-300 underline">
        Go home
      </Link>
    </div>
  );
}
