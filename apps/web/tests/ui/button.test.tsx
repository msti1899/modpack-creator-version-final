import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Check } from "lucide-react";
import { expect, test, vi } from "vitest";
import { Button } from "@/components/ui/button";

test("the shadcn button renders its label, variant and a Lucide icon", () => {
  render(
    <Button variant="outline">
      <Check data-testid="icon" aria-hidden="true" />
      Save draft
    </Button>,
  );

  const button = screen.getByRole("button", { name: /save draft/i });
  expect(button).toBeInTheDocument();
  expect(button).toHaveAttribute("data-slot", "button");
  expect(screen.getByTestId("icon").tagName.toLowerCase()).toBe("svg");
});

test("the button forwards clicks and honours the disabled state", async () => {
  const user = userEvent.setup();
  const onClick = vi.fn();
  const { rerender } = render(<Button onClick={onClick}>Publish</Button>);

  await user.click(screen.getByRole("button", { name: /publish/i }));
  expect(onClick).toHaveBeenCalledTimes(1);

  rerender(
    <Button onClick={onClick} disabled>
      Publish
    </Button>,
  );
  await user.click(screen.getByRole("button", { name: /publish/i }));
  expect(onClick).toHaveBeenCalledTimes(1);
});

test("asChild replaces the element with Radix Slot instead of nesting a button", () => {
  render(
    <Button asChild>
      <a href="/packs">Open packs</a>
    </Button>,
  );

  const link = screen.getByRole("link", { name: /open packs/i });
  expect(link).toHaveAttribute("href", "/packs");
  expect(link).toHaveAttribute("data-slot", "button");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
