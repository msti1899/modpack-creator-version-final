import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import { expect, test, vi } from "vitest";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(3, "Use at least 3 characters."),
  members: z.number().int().min(1, "Add at least one member."),
});

type GroupForm = z.infer<typeof schema>;

function GroupForm({ onSubmit }: { onSubmit: (values: GroupForm) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GroupForm>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", members: 0 },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <label htmlFor="name">Group name</label>
      <input id="name" {...register("name")} />
      {errors.name ? <p role="alert">{errors.name.message}</p> : null}

      <label htmlFor="members">Members</label>
      <input id="members" type="number" {...register("members", { valueAsNumber: true })} />
      {errors.members ? <p role="alert">{errors.members.message}</p> : null}

      <button type="submit">Create group</button>
    </form>
  );
}

test("zod rejects an invalid submission before the handler runs", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<GroupForm onSubmit={onSubmit} />);

  await user.click(screen.getByRole("button", { name: /create group/i }));

  expect(onSubmit).not.toHaveBeenCalled();
  expect(await screen.findByText("Use at least 3 characters.")).toBeInTheDocument();
  expect(screen.getByText("Add at least one member.")).toBeInTheDocument();
});

test("a valid submission reaches the handler with coerced values", async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(<GroupForm onSubmit={onSubmit} />);

  await user.type(screen.getByLabelText(/group name/i), "  Builders  ");
  await user.clear(screen.getByLabelText(/members/i));
  await user.type(screen.getByLabelText(/members/i), "4");
  await user.click(screen.getByRole("button", { name: /create group/i }));

  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit.mock.calls[0]?.[0]).toEqual({ name: "Builders", members: 4 });
});
