import { abbreviateAddress } from "@morpho-blue-offchain-public/uikit/lib/utils";
import userEvent from "@testing-library/user-event";
import { http, UserRejectedRequestError } from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { mainnet, base } from "viem/chains";
import { describe, expect, vi } from "vitest";
import { mock } from "wagmi";

import { testWithMainnetFork, rpcUrls } from "../../config";
import { render, screen, waitFor, waitForElementToBeRemoved } from "../../providers";

import Page from "@/app/dashboard/page";
import { createConfig } from "@/lib/config";

describe("connect wallet flow", () => {
  testWithMainnetFork("handles user rejection gracefully", async ({ client }) => {
    const account = privateKeyToAddress(generatePrivateKey());
    const wagmiConfig = createConfig({
      chains: [mainnet, base],
      transports: {
        [mainnet.id]: http(client.transport.url),
        [base.id]: http(rpcUrls[base.id]),
      },
      connectors: [
        mock({
          accounts: [account],
          features: {
            connectError: new UserRejectedRequestError(new Error("Failed to connect.")),
          },
        }),
      ],
    });

    render(<Page />, { wagmiConfig });

    await userEvent.click(screen.getByText("Connect Wallet"));
    await userEvent.click(await screen.findByText("Mock Connector"));

    await waitFor(() => screen.findByText("Requesting Connection"));
    await waitForElementToBeRemoved(screen.getByText("Requesting Connection"));

    expect(screen.getByText("Request Cancelled")).toBeInTheDocument();
  });

  testWithMainnetFork("shows user address once connected", async ({ client }) => {
    const account = privateKeyToAddress(generatePrivateKey());
    const wagmiConfig = createConfig({
      chains: [mainnet, base],
      transports: {
        [mainnet.id]: http(client.transport.url),
        [base.id]: http(rpcUrls[base.id]),
      },
      connectors: [mock({ accounts: [account] })],
    });

    render(<Page />, { wagmiConfig });

    await userEvent.click(screen.getByText("Connect Wallet"));
    await userEvent.click(await screen.findByText("Mock Connector"));

    await waitFor(() => screen.findByText("Requesting Connection"));
    await waitForElementToBeRemoved(screen.getByText("Requesting Connection"));

    expect(screen.getByText(abbreviateAddress(account))).toBeInTheDocument();
  });
});

describe("switch chain flow", () => {
  testWithMainnetFork("switches to base without wallet and opens main app", async ({ client }) => {
    const account = privateKeyToAddress(generatePrivateKey());
    const wagmiConfig = createConfig({
      chains: [mainnet, base],
      transports: {
        [mainnet.id]: http(client.transport.url),
        [base.id]: http(rpcUrls[base.id]),
      },
      connectors: [mock({ accounts: [account] })],
    });

    render(<Page />, {
      wagmiConfig,
      routes: [{ element: <div>Switched to Base successfully!</div>, path: "base/earn" }],
    });

    window.open = vi.fn();

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByText("Base"));

    expect(screen.getByText("Switched to Base successfully!")).toBeInTheDocument();
    expect(window.open).toHaveBeenCalledWith("https://app.morpho.org/base/earn", "_blank", "noopener,noreferrer");
  });

  testWithMainnetFork("switches to base with wallet and opens main app", async ({ client }) => {
    const account = privateKeyToAddress(generatePrivateKey());
    const wagmiConfig = createConfig({
      chains: [mainnet, base],
      transports: {
        [mainnet.id]: http(client.transport.url),
        [base.id]: http(rpcUrls[base.id]),
      },
      connectors: [mock({ accounts: [account], features: { defaultConnected: true } })],
    });

    render(<Page />, {
      wagmiConfig,
      routes: [{ element: <div>Switched to Base successfully!</div>, path: "base/earn" }],
    });

    window.open = vi.fn();

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByText("Base"));

    expect(screen.getByText("Switched to Base successfully!")).toBeInTheDocument();
    expect(window.open).toHaveBeenCalledWith("https://app.morpho.org/base/earn", "_blank", "noopener,noreferrer");
  });
});
