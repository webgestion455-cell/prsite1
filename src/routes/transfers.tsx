import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/transfers")({
  component: () => <Outlet />,
});
