import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const queryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

test("TanStack Query resolves a query and caches the result", async () => {
  const fetcher = vi.fn(async () => ({ total: 2 }));
  let rendersWithData = 0;

  function Counter() {
    const { data, isPending } = useQuery({ queryKey: ["packs"], queryFn: fetcher });
    if (isPending || !data) return <p>Loading packs</p>;
    rendersWithData++;
    return <p>{`Packs: ${data.total}`}</p>;
  }

  render(
    <QueryClientProvider client={queryClient()}>
      <Counter />
    </QueryClientProvider>,
  );

  expect(screen.getByText("Loading packs")).toBeInTheDocument();
  expect(await screen.findByText("Packs: 2")).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(rendersWithData).toBeGreaterThan(0);
});

test("a failing query surfaces its error to the consumer", async () => {
  function Broken() {
    const { error, isError } = useQuery({
      queryKey: ["broken"],
      queryFn: async () => {
        throw new Error("catalog unavailable");
      },
    });
    return <p>{isError ? error.message : "pending"}</p>;
  }

  render(
    <QueryClientProvider client={queryClient()}>
      <Broken />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(screen.getByText("catalog unavailable")).toBeInTheDocument());
});
