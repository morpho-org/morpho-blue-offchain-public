import { Dialog } from "@morpho-org/uikit/components/shadcn/dialog";
import { Token } from "@morpho-org/uikit/lib/utils";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { Address, defineChain, erc4626Abi, ExtractAbiItem, formatUnits, http, Log, parseEther, parseUnits } from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { polygon } from "viem/chains";
import { describe, expect } from "vitest";
import { mock, useConnect } from "wagmi";

import { testWithPolygonFork } from "../config";
import { render, screen, waitFor } from "../providers";

import { EarnSheetContent } from "@/components/earn-sheet-content";
import { createConfig } from "@/lib/wagmi-config";

function TestableEarnSheetContent(params: Parameters<typeof EarnSheetContent>[0]) {
  const { status, connect, connectors } = useConnect();
  useEffect(() => connect({ connector: connectors[0] }), [connect, connectors]);

  if (status !== "success") return undefined;

  return (
    <Dialog open={true}>
      <EarnSheetContent {...params} />
    </Dialog>
  );
}

type WithdrawLog = Log<bigint, number, false, ExtractAbiItem<typeof erc4626Abi, "Withdraw">, true>;

describe("withdraw flow", () => {
  testWithPolygonFork("encodes withdraw max correctly", async ({ client }) => {
    const account = privateKeyToAddress(generatePrivateKey());
    const chain = defineChain({ ...polygon, rpcUrls: { default: { http: [client.transport.url!] } } });
    const wagmiConfig = createConfig({
      chains: [chain],
      transports: { [chain.id]: http(client.transport.url) },
      connectors: [
        mock({
          accounts: [account],
          features: { defaultConnected: true, reconnect: true },
        }),
      ],
    });

    const vaultAddress: Address = "0xF5C81d25ee174d83f1FD202cA94AE6070d073cCF";
    const asset: Token = {
      address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
      symbol: "WETH",
      decimals: 18,
      imageSrc: "./morpho.svg",
    };

    const shares = "1.2";
    await client.deal({ account, amount: parseEther("0.1") }); // for gas
    await client.deal({ account, amount: parseEther(shares), erc20: vaultAddress }); // for withdraw
    await client.impersonateAccount({ address: account });

    const [maxWithdraw, maxRedeem] = await Promise.all([
      client.readContract({ abi: erc4626Abi, address: vaultAddress, functionName: "maxWithdraw", args: [account] }),
      client.readContract({ abi: erc4626Abi, address: vaultAddress, functionName: "maxRedeem", args: [account] }),
    ]);
    const maxText = formatUnits(maxWithdraw, asset.decimals!);

    render(<TestableEarnSheetContent vaultAddress={vaultAddress} asset={asset} />, { wagmiConfig });

    // Wait for tabs -- this implies the `Testable` wrapper has connected the mock account
    await waitFor(() => screen.findAllByRole("tab"));
    const tabs = screen.getAllByRole("tab");
    await userEvent.click(tabs.find((tab) => tab.textContent === "Withdraw")!);

    expect(screen.getByPlaceholderText("0")).toBeInTheDocument();

    // Wait for MAX button -- this implies the component has loaded account balances
    await waitFor(() => screen.findAllByText("MAX"), { timeout: 10_000 });
    await userEvent.click(screen.getByText("MAX"));

    expect(screen.getByDisplayValue(maxText)).toBeInTheDocument();

    const transactionButton = screen.getAllByText("Withdraw").find((element) => element.role !== "tab")!;

    // Wait for withdraw to be automined
    const [, withdraw] = await Promise.all([
      userEvent.click(transactionButton),
      new Promise<WithdrawLog>((resolve) => {
        const unwatch = client.watchContractEvent({
          abi: erc4626Abi,
          address: vaultAddress,
          eventName: "Withdraw",
          strict: true,
          onLogs(logs) {
            unwatch();
            expect(logs.length).toBe(1);
            resolve(logs[0]);
          },
        });
      }),
    ]);

    expect(withdraw.args.owner).toBe(account);
    expect(withdraw.args.receiver).toBe(account);
    expect(withdraw.args.shares).toBe(maxRedeem);
  });

  testWithPolygonFork("encodes withdraw correctly", async ({ client }) => {
    const account = privateKeyToAddress(generatePrivateKey());
    const chain = defineChain({ ...polygon, rpcUrls: { default: { http: [client.transport.url!] } } });
    const wagmiConfig = createConfig({
      chains: [chain],
      transports: { [chain.id]: http(client.transport.url) },
      connectors: [
        mock({
          accounts: [account],
          features: { defaultConnected: true, reconnect: true },
        }),
      ],
    });

    const vaultAddress: Address = "0xF5C81d25ee174d83f1FD202cA94AE6070d073cCF";
    const asset: Token = {
      address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
      symbol: "WETH",
      decimals: 18,
      imageSrc: "./morpho.svg",
    };

    const shares = "1.2";
    await client.deal({ account, amount: parseEther("0.1") }); // for gas
    await client.deal({ account, amount: parseEther(shares), erc20: vaultAddress }); // for withdraw
    await client.impersonateAccount({ address: account });

    render(<TestableEarnSheetContent vaultAddress={vaultAddress} asset={asset} />, { wagmiConfig });

    // Wait for tabs -- this implies the `Testable` wrapper has connected the mock account
    await waitFor(() => screen.findAllByRole("tab"));
    const tabs = screen.getAllByRole("tab");
    await userEvent.click(tabs.find((tab) => tab.textContent === "Withdraw")!);

    expect(screen.getByPlaceholderText("0")).toBeInTheDocument();

    // Wait for MAX button -- this implies the component has loaded account balances
    await waitFor(() => screen.findAllByText("MAX"), { timeout: 10_000 });

    // Type an amount LESS THAN the max
    const amount = "1.0";
    await userEvent.type(screen.getByPlaceholderText("0"), amount);

    const transactionButton = screen.getAllByText("Withdraw").find((element) => element.role !== "tab")!;

    // Wait for withdraw to be automined
    const [, withdraw] = await Promise.all([
      userEvent.click(transactionButton),
      new Promise<WithdrawLog>((resolve) => {
        const unwatch = client.watchContractEvent({
          abi: erc4626Abi,
          address: vaultAddress,
          eventName: "Withdraw",
          strict: true,
          onLogs(logs) {
            unwatch();
            expect(logs.length).toBe(1);
            resolve(logs[0]);
          },
        });
      }),
    ]);

    expect(withdraw.args.owner).toBe(account);
    expect(withdraw.args.receiver).toBe(account);
    expect(withdraw.args.assets).toBe(parseUnits(amount, asset.decimals!));
  });
});
