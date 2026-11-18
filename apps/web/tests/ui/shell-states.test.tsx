import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { NoGroupState, ShellError, SignedOutState } from "@/components/shell-states";

describe("the shell's states", () => {
  test("signed out keeps one sentence and one sign-in action pointing at the route", () => {
    render(<SignedOutState signInHref="/sign-in?redirect_url=%2Fmods" />);

    expect(screen.getByText("Sign in to continue")).toBeInTheDocument();
    expect(
      screen.getByText("This group and its mods stay private until you sign in."),
    ).toBeInTheDocument();
    const action = screen.getByRole("link", { name: "Sign in" });
    expect(action).toHaveAttribute("href", "/sign-in?redirect_url=%2Fmods");
  });

  test("no group keeps both exits visible and announces them as unavailable", () => {
    render(<NoGroupState />);

    expect(screen.getByText("No group yet")).toBeInTheDocument();
    for (const name of ["Create a group", "Open a link"]) {
      const action = screen.getByRole("button", { name });
      expect(action).toBeVisible();
      expect(action).toHaveAttribute("aria-disabled", "true");
    }
    // No group name is invented anywhere in the card.
    expect(screen.queryByText(/Copper Hollow/)).not.toBeInTheDocument();
  });

  test("no group explains why each exit is unavailable and neither acts", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      render(<NoGroupState />);

      // S7/S14: the description names what is missing, and it is the target of
      // each control's aria-describedby rather than a hidden aside.
      const note = screen.getByText(
        "Creating a group and opening a link are not available yet because the group page is not built.",
      );
      expect(note).toHaveClass("sr-only");

      for (const name of ["Create a group", "Open a link"]) {
        const action = screen.getByRole("button", { name });
        const describedBy = action.getAttribute("aria-describedby");
        expect(describedBy).toBeTruthy();
        expect(document.getElementById(describedBy ?? "")).toBe(note);

        // Inert means inert: no destination to promise, and a press does nothing.
        expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
        expect(action).not.toHaveAttribute("href");
        await userEvent.click(action);
        expect(fetchSpy).not.toHaveBeenCalled();
      }

      // No spinner, no success message, no error surface.
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("the error surface renders one sentence and retries that read", async () => {
    const onRetry = vi.fn();
    render(<ShellError sentence="We couldn’t load this group just now." onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("We couldn’t load this group just now.");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("the error surface never shows a status code", () => {
    render(<ShellError sentence="We couldn’t load this group just now." onRetry={() => {}} />);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/\b[45]\d\d\b/);
  });
});
