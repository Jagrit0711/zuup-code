import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Link } from "react-router-dom";

const crash = vi.hoisted(() => ({ landing: true }));
vi.mock("@/pages/Landing", () => ({
  default: () => {
    if (crash.landing) throw new Error("landing exploded");
    return <p>landing page</p>;
  },
}));
vi.mock("@/pages/Contact", () => ({ default: () => <p>contact page</p> }));
vi.mock("@/pages/ShareView", () => ({ default: () => <p>shared code</p> }));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { AppRoutes } from "@/App";

const future = { v7_startTransition: true, v7_relativeSplatPath: true } as const;

describe("App routes", () => {
  it("contains a crashing page and recovers when the route changes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <MemoryRouter initialEntries={["/"]} future={future}>
        <Link to="/contact">go to contact</Link>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("This part of Zuup Code stopped working");
    // The rest of the app (here, a link outside the boundary) still works.
    fireEvent.click(screen.getByText("go to contact"));
    expect(await screen.findByText("contact page")).toBeInTheDocument();
  });

  it("loads lazy routes behind Suspense", async () => {
    render(
      <MemoryRouter initialEntries={["/s/abc"]} future={future}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(await screen.findByText("shared code")).toBeInTheDocument();
  });

  it("sends signed-out visitors from a protected route to /login", async () => {
    render(
      <MemoryRouter initialEntries={["/editor?project=a&x=b"]} future={future}>
        <AppRoutes />
      </MemoryRouter>
    );
    expect(await screen.findByText(/sign in to zuup code/i)).toBeInTheDocument();
  });
});
