import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { NearbyLearners } from "./nearby-learners";
import type { ContactsClient } from "@/lib/contacts-client";

const ada = "22222222-2222-4222-8222-222222222222";

const notSharing = { sharing: false, expiresAt: null, nearby: [] };

function sharing(nearby: unknown[] = []) {
  // Far enough ahead that the countdown always reads in hours.
  return {
    sharing: true,
    expiresAt: new Date(Date.now() + 3.7 * 60 * 60 * 1000).toISOString(),
    nearby,
  };
}

/** `find_nearby_learners` answers from a queue; everything else answers once. */
function createClient(states: unknown[]) {
  const remaining = [...states];
  const rpc = vi.fn((name: string) => {
    if (name === "find_nearby_learners") {
      return Promise.resolve({
        data: remaining.length > 1 ? remaining.shift() : remaining[0],
        error: null,
      });
    }
    if (name === "share_location") return Promise.resolve({ data: sharing(), error: null });
    if (name === "stop_sharing_location") return Promise.resolve({ data: notSharing, error: null });
    return Promise.resolve({ data: { status: "sent" }, error: null });
  });
  return { client: { rpc } as unknown as ContactsClient, rpc };
}

function stubGeolocation(position: { latitude: number; longitude: number } | "denied") {
  const getCurrentPosition = vi.fn(
    (
      resolve: (value: { coords: { latitude: number; longitude: number } }) => void,
      reject: (error: { code: number; PERMISSION_DENIED: number }) => void,
    ) => {
      if (position === "denied") reject({ code: 1, PERMISSION_DENIED: 1 });
      else resolve({ coords: position });
    },
  );
  Object.defineProperty(window.navigator, "geolocation", {
    value: { getCurrentPosition },
    configurable: true,
  });
  return getCurrentPosition;
}

afterEach(cleanup);

it("starts sharing as soon as the panel opens", async () => {
  const getCurrentPosition = stubGeolocation({ latitude: 37.87159274, longitude: -122.2584937 });
  const { client, rpc } = createClient([notSharing, sharing()]);

  render(<NearbyLearners client={client} onContactRequested={() => undefined} />);

  await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled());
  await waitFor(() =>
    expect(rpc).toHaveBeenCalledWith("share_location", {
      p_latitude: 37.872,
      p_longitude: -122.258,
    }),
  );
});

it("falls back to the button, with the reason, when the browser refuses on open", async () => {
  stubGeolocation("denied");
  const { client, rpc } = createClient([notSharing]);

  render(<NearbyLearners client={client} onContactRequested={() => undefined} />);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Your browser did not share your location",
  );
  expect(await screen.findByRole("button", { name: "Find classmates nearby" })).toBeInTheDocument();
  expect(rpc).not.toHaveBeenCalledWith("share_location", expect.anything());
});

it("shares a blunted coordinate once asked, and says when it stops on its own", async () => {
  stubGeolocation({ latitude: 37.87159274, longitude: -122.2584937 });
  const { client, rpc } = createClient([notSharing, sharing()]);

  render(<NearbyLearners client={client} onContactRequested={() => undefined} />);
  fireEvent.click(await screen.findByRole("button", { name: "Find classmates nearby" }));

  await waitFor(() =>
    expect(rpc).toHaveBeenCalledWith("share_location", {
      p_latitude: 37.872,
      p_longitude: -122.258,
    }),
  );
  expect(await screen.findByText(/Sharing — stops on its own in 3 h/)).toBeInTheDocument();
});

it("refreshes the reading on open only for someone already sharing", async () => {
  const getCurrentPosition = stubGeolocation({ latitude: 37.87, longitude: -122.26 });
  const { client } = createClient([sharing()]);

  render(<NearbyLearners client={client} onContactRequested={() => undefined} />);

  await waitFor(() => expect(getCurrentPosition).toHaveBeenCalled());
});

it("shows a band rather than a distance, closest first", async () => {
  stubGeolocation({ latitude: 37.87, longitude: -122.26 });
  const { client } = createClient([
    sharing([
      { userId: "u2", name: "zoe", distance: "city", relation: "none" },
      { userId: ada, name: "ada", distance: "here", relation: "none" },
    ]),
  ]);

  render(<NearbyLearners client={client} onContactRequested={() => undefined} />);

  const rows = await screen.findAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("ada");
  expect(rows[0]).toHaveTextContent("Right here");
  expect(rows[1]).toHaveTextContent("Same city");
  // A band, never a number of metres — checked on the rows, since the sharing countdown
  // legitimately contains a minutes figure.
  for (const row of rows) expect(row.textContent).not.toMatch(/\d/);
});

it("asks by id when adding someone, and marks the row as asked", async () => {
  stubGeolocation({ latitude: 37.87, longitude: -122.26 });
  const onContactRequested = vi.fn();
  const { client, rpc } = createClient([
    sharing([{ userId: ada, name: "ada", distance: "here", relation: "none" }]),
  ]);

  render(<NearbyLearners client={client} onContactRequested={onContactRequested} />);
  fireEvent.click(await screen.findByRole("button", { name: "Ask ada to be a contact" }));

  await waitFor(() => expect(rpc).toHaveBeenCalledWith("request_contact", { p_user_id: ada }));
  expect(onContactRequested).toHaveBeenCalled();
  expect(await screen.findByText("Asked")).toBeInTheDocument();
});

it("offers no add button for someone already a contact", async () => {
  stubGeolocation({ latitude: 37.87, longitude: -122.26 });
  const { client } = createClient([
    sharing([{ userId: ada, name: "ada", distance: "here", relation: "contact" }]),
  ]);

  render(<NearbyLearners client={client} onContactRequested={() => undefined} />);

  expect(await screen.findByText("Already a contact")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Ask ada/ })).toBeNull();
});

it("says why nobody could be found when the browser refuses", async () => {
  stubGeolocation("denied");
  const { client } = createClient([notSharing]);

  render(<NearbyLearners client={client} onContactRequested={() => undefined} />);
  fireEvent.click(await screen.findByRole("button", { name: "Find classmates nearby" }));

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Your browser did not share your location",
  );
});

it("stops sharing back to the opt-in state", async () => {
  stubGeolocation({ latitude: 37.87, longitude: -122.26 });
  const { client, rpc } = createClient([sharing()]);

  render(<NearbyLearners client={client} onContactRequested={() => undefined} />);
  fireEvent.click(await screen.findByRole("button", { name: "Stop sharing" }));

  await waitFor(() => expect(rpc).toHaveBeenCalledWith("stop_sharing_location", {}));
  expect(await screen.findByRole("button", { name: "Find classmates nearby" })).toBeInTheDocument();
});
