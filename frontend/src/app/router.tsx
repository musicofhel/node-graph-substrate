import { Suspense, lazy, type ReactNode } from "react";
import { createBrowserRouter } from "react-router";
import { RouteErrorFallback } from "./errors/RootErrorBoundary";

const AppShell = lazy(() => import("./layout/AppShell"));
const HomePage = lazy(() => import("../pages/home/HomePage"));
const CanvasPage = lazy(() => import("../pages/canvas/CanvasPage"));
const ProjectsListPage = lazy(() => import("../pages/projects/ProjectsListPage"));
const StreamsPage = lazy(() => import("../pages/streams/StreamsPage"));
const DaemonsPage = lazy(() => import("../pages/daemons/DaemonsPage"));
const PacksListPage = lazy(() => import("../pages/packs/PacksListPage"));
const PackDetailPage = lazy(() => import("../pages/packs/PackDetailPage"));
const SettingsPage = lazy(() => import("../pages/settings/SettingsPage"));
const LoginPage = lazy(() => import("../pages/login/LoginPage"));
const NotFoundPage = lazy(() => import("./errors/NotFoundPage"));

function Loading() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <p className="text-sm text-neutral-500">Loading...</p>
    </div>
  );
}

function page(Component: React.LazyExoticComponent<() => ReactNode>): ReactNode {
  return (
    <Suspense fallback={<Loading />}>
      <Component />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: "/login",
    element: page(LoginPage),
  },
  {
    element: (
      <Suspense fallback={<Loading />}>
        <AppShell />
      </Suspense>
    ),
    errorElement: <RouteErrorFallback />,
    children: [
      { index: true, element: page(HomePage) },
      { path: "projects", element: page(ProjectsListPage) },
      { path: "p/:projectId/c/:canvasId", element: page(CanvasPage) },
      { path: "streams", element: page(StreamsPage) },
      { path: "daemons", element: page(DaemonsPage) },
      { path: "packs", element: page(PacksListPage) },
      { path: "packs/:packId", element: page(PackDetailPage) },
      { path: "settings", element: page(SettingsPage) },
      { path: "*", element: page(NotFoundPage) },
    ],
  },
]);
