import { Suspense } from "react";
import { RouterProvider } from "react-router";
import { router } from "./app/router";
import { Providers } from "./app/providers";
import { RootErrorBoundary } from "./app/errors/RootErrorBoundary";

function LoadingScreen() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-neutral-950 text-neutral-500">
      Loading...
    </div>
  );
}

export default function App() {
  return (
    <RootErrorBoundary>
      <Providers>
        <Suspense fallback={<LoadingScreen />}>
          <RouterProvider router={router} />
        </Suspense>
      </Providers>
    </RootErrorBoundary>
  );
}
