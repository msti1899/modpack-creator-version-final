import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const clerk = vi.hoisted(() => {
  const signIn = {
    status: "needs_first_factor" as string,
    password: vi.fn(),
    sso: vi.fn(),
    create: vi.fn(),
    finalize: vi.fn(),
    reset: vi.fn(),
    resetPasswordEmailCode: { sendCode: vi.fn() },
  };
  return { signIn, push: vi.fn() };
});

vi.mock("@clerk/nextjs", () => ({
  useSignIn: () => ({ signIn: clerk.signIn }),
  SignUpButton: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: clerk.push }),
}));

vi.mock("@clerk/nextjs/errors", () => ({
  isClerkAPIResponseError: (cause: unknown) =>
    Boolean(cause && typeof cause === "object" && Array.isArray((cause as { errors?: unknown }).errors)),
}));

import { SignInCard } from "@/components/sign-in-card";

function renderCard() {
  return render(<SignInCard cardClassName="card" />);
}

beforeEach(() => {
  vi.clearAllMocks();
  clerk.signIn.status = "needs_first_factor";
});

test("the card renders the approved composition", () => {
  renderCard();

  expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
  expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
  expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  expect(screen.getByRole("button", { name: "Forgot password?" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /continue with discord/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create one" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
});

test("a complete password sign-in finalizes the session and returns home", async () => {
  const user = userEvent.setup();
  clerk.signIn.password.mockImplementation(async () => {
    clerk.signIn.status = "complete";
    return { error: null };
  });
  clerk.signIn.finalize.mockResolvedValue({ error: null });
  renderCard();

  await user.type(screen.getByLabelText("Email"), "  owner@example.com  ");
  await user.type(screen.getByLabelText("Password"), "correct horse battery staple");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  await waitFor(() =>
    expect(clerk.signIn.password).toHaveBeenCalledWith({
      identifier: "owner@example.com",
      password: "correct horse battery staple",
    }),
  );
  await waitFor(() => expect(clerk.signIn.finalize).toHaveBeenCalled());
  expect(clerk.push).toHaveBeenCalledWith("/");
});

test("a provider error is shown and the form stays usable", async () => {
  const user = userEvent.setup();
  clerk.signIn.password.mockResolvedValue({
    error: { longMessage: "Password is incorrect.", code: "form_password_incorrect" },
  });
  renderCard();

  await user.type(screen.getByLabelText("Email"), "owner@example.com");
  await user.type(screen.getByLabelText("Password"), "wrong-password-value");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Password is incorrect.");
  expect(clerk.signIn.finalize).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
});

test("a sign-in that needs another factor says so instead of navigating", async () => {
  const user = userEvent.setup();
  clerk.signIn.password.mockResolvedValue({ error: null });
  renderCard();

  await user.type(screen.getByLabelText("Email"), "owner@example.com");
  await user.type(screen.getByLabelText("Password"), "correct horse battery staple");
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/another step/i);
  expect(clerk.push).not.toHaveBeenCalled();
});

test("forgot password identifies the account, asks for a reset code and confirms on screen", async () => {
  const user = userEvent.setup();
  clerk.signIn.create.mockResolvedValue({ error: null });
  clerk.signIn.resetPasswordEmailCode.sendCode.mockResolvedValue({ error: null });
  renderCard();

  await user.type(screen.getByLabelText("Email"), "owner@example.com");
  await user.click(screen.getByRole("button", { name: "Forgot password?" }));

  await waitFor(() =>
    expect(clerk.signIn.create).toHaveBeenCalledWith({ identifier: "owner@example.com" }),
  );
  expect(clerk.signIn.resetPasswordEmailCode.sendCode).toHaveBeenCalledTimes(1);
  expect(await screen.findByRole("heading", { level: 1, name: "Check your email" })).toBeInTheDocument();
  expect(screen.getByText("owner@example.com")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Back to sign in" }));
  expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
});

test("an unknown account still confirms, so the screen never reveals registration", async () => {
  const user = userEvent.setup();
  clerk.signIn.create.mockResolvedValue({
    error: { code: "form_identifier_not_found", message: "Couldn't find your account." },
  });
  renderCard();

  await user.type(screen.getByLabelText("Email"), "nobody@example.com");
  await user.click(screen.getByRole("button", { name: "Forgot password?" }));

  expect(await screen.findByRole("heading", { level: 1, name: "Check your email" })).toBeInTheDocument();
  expect(clerk.signIn.resetPasswordEmailCode.sendCode).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("forgot password without an email explains what is missing and calls nothing", async () => {
  const user = userEvent.setup();
  renderCard();

  await user.click(screen.getByRole("button", { name: "Forgot password?" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Enter your email address");
  expect(clerk.signIn.create).not.toHaveBeenCalled();
});

test("the reveal control toggles the password field between masked and plain text", async () => {
  const user = userEvent.setup();
  renderCard();

  expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");

  await user.click(screen.getByRole("button", { name: "Show password" }));
  expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");

  await user.click(screen.getByRole("button", { name: "Hide password" }));
  expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
});
