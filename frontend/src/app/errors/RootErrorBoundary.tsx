import { Component, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { log } from "../../lib/logging";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this error report:", text);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="rounded bg-neutral-800 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
    >
      {copied ? "Copied!" : "Report to clipboard"}
    </button>
  );
}

function ErrorPanel({ message, stack }: { message: string; stack?: string }) {
  const report = JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      error: message,
      stack: stack ?? null,
    },
    null,
    2,
  );

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-[#0a0a0a] text-neutral-300">
      <h1 className="text-lg font-medium">Something went wrong</h1>
      <p className="max-w-md text-center text-sm text-neutral-500">
        {message}
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => window.location.reload()}
          className="rounded bg-neutral-800 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
        >
          Reload
        </button>
        <CopyButton text={report} />
      </div>
    </div>
  );
}

export function RouteErrorFallback() {
  const error = useRouteError();
  let message = "An unexpected error occurred.";
  let stack: string | undefined;
  if (isRouteErrorResponse(error)) {
    message = `${error.status} — ${error.statusText}`;
  } else if (error instanceof Error) {
    message = error.message;
    stack = error.stack;
  }
  return <ErrorPanel message={message} stack={stack} />;
}

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error({
      event: "root_error_boundary",
      error: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorPanel
          message={this.state.error?.message ?? "An unexpected error occurred."}
          stack={this.state.error?.stack}
        />
      );
    }
    return this.props.children;
  }
}
