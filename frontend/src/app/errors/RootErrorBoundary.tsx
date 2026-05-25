import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[#0a0a0a] text-neutral-300">
      <h1 className="text-lg font-medium">Something went wrong</h1>
      <p className="max-w-md text-center text-sm text-neutral-500">
        {message}
      </p>
      <button
        onClick={() => window.location.reload()}
        className="rounded bg-neutral-800 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
      >
        Reload
      </button>
    </div>
  );
}

export function RouteErrorFallback() {
  const error = useRouteError();
  let message = "An unexpected error occurred.";
  if (isRouteErrorResponse(error)) {
    message = `${error.status} — ${error.statusText}`;
  } else if (error instanceof Error) {
    message = error.message;
  }
  return <ErrorPanel message={message} />;
}

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Root error boundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorPanel message={this.state.error?.message ?? "An unexpected error occurred."} />;
    }
    return this.props.children;
  }
}
