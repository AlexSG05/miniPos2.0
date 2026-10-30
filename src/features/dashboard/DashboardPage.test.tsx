import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardPage from "./DashboardPage";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("DashboardPage", () => {
  it("muestra que las métricas comerciales aún no se han implementado", () => {
    render(<DashboardPage />);
    expect(screen.getByRole("heading", { name: "Resumen del negocio" })).toBeInTheDocument();
    expect(screen.getByText(/Las métricas comerciales se mostrarán/)).toBeInTheDocument();
  });
});
