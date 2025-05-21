import { IMarket, MarketId, MarketParams } from "@morpho-org/blue-sdk";
import { morphoAbi } from "@morpho-org/uikit/assets/abis/morpho";
import { Dialog } from "@morpho-org/uikit/components/shadcn/dialog";
import { Token } from "@morpho-org/uikit/lib/utils";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { defineChain, erc20Abi, ExtractAbiItem, http, Log, parseEther, parseUnits, PublicClient } from "viem";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";
import { polygon } from "viem/chains";
import { describe, expect } from "vitest";
import { mock, useConnect } from "wagmi";

import { testWithPolygonFork } from "../config";
import { render, screen, waitFor } from "../providers";

import { BorrowSheetContent } from "@/components/borrow-sheet-content";
import { createConfig } from "@/lib/wagmi-config";

type ApprovalLog = Log<bigint, number, false, ExtractAbiItem<typeof erc20Abi, "Approval">, true>;
type SupplyLog = Log<bigint, number, false, ExtractAbiItem<typeof morphoAbi, "SupplyCollateral">, true>;
type WithdrawLog = Log<bigint, number, false, ExtractAbiItem<typeof morphoAbi, "WithdrawCollateral">, true>;
type RepayLog = Log<bigint, number, false, ExtractAbiItem<typeof morphoAbi, "Repay">, true>;

function TestableBorrowSheetContent(params: Parameters<typeof BorrowSheetContent>[0]) {
  const { status, connect, connectors } = useConnect();
  useEffect(() => connect({ connector: connectors[0] }), [connect, connectors]);

  if (status !== "success") return undefined;

  return (
    <Dialog open={true}>
      <BorrowSheetContent {...params} />
    </Dialog>
  );
}

const loanToken: Token = {
  address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
  symbol: "WETH",
  decimals: 18,
  imageSrc: "./morpho.svg",
};
const collateralToken: Token = {
  address: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
  symbol: "WBTC",
  decimals: 8,
  imageSrc: "./morpho.svg",
};
const morphoAddress = "0x1bF0c2541F820E775182832f06c0B7Fc27A25f67";
const marketId = "0x9eacb622c6ef9c2f0fa5f1fda58a8702eb8132d8f49783f6eea6acc3a398e741" as MarketId;

async function fetchMarket(client: PublicClient) {
  const [marketParamsRaw, marketRaw] = await Promise.all([
    client.readContract({
      abi: morphoAbi,
      address: morphoAddress,
      functionName: "idToMarketParams",
      args: [marketId],
    }),
    client.readContract({
      abi: morphoAbi,
      address: morphoAddress,
      functionName: "market",
      args: [marketId],
    }),
  ]);
  return {
    params: new MarketParams({
      loanToken: marketParamsRaw[0],
      collateralToken: marketParamsRaw[1],
      oracle: marketParamsRaw[2],
      irm: marketParamsRaw[3],
      lltv: marketParamsRaw[4],
    }),
    totalSupplyAssets: marketRaw[0],
    totalSupplyShares: marketRaw[1],
    totalBorrowAssets: marketRaw[2],
    totalBorrowShares: marketRaw[3],
    lastUpdate: marketRaw[4],
    fee: marketRaw[5],
  } as IMarket;
}

describe("supply collateral flow", () => {
  testWithPolygonFork("encodes approval and supply collateral correctly", async ({ client }) => {
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

    const market = await fetchMarket(client as unknown as PublicClient);
    const amountText = "1.2";
    const amount = parseUnits(amountText, collateralToken.decimals!);
    await client.deal({ account, amount: parseEther("0.1") }); // for gas
    await client.deal({ account, amount, erc20: collateralToken.address }); // for collateral
    await client.impersonateAccount({ address: account });

    render(
      <TestableBorrowSheetContent
        marketId={marketId}
        marketParams={market.params}
        imarket={market}
        tokens={
          new Map([
            [loanToken.address, loanToken],
            [collateralToken.address, collateralToken],
          ])
        }
      />,
      { wagmiConfig },
    );

    // Wait for tabs -- this implies the `Testable` wrapper has connected the mock account
    await waitFor(() => screen.findAllByRole("tab"));
    const tabs = screen.getAllByRole("tab");
    await userEvent.click(tabs.find((tab) => tab.textContent === "Supply")!);

    const inputField = screen.getByPlaceholderText("0");
    expect(inputField).toBeInTheDocument();
    await userEvent.type(inputField, amountText);

    // Wait for Approve button -- this implies the component has loaded account allowance
    await waitFor(() => screen.findByText("Approve"), { timeout: 10_000 });

    // Wait for approval to be automined
    const [, approval] = await Promise.all([
      userEvent.click(screen.getByText("Approve")),
      new Promise<ApprovalLog>((resolve) => {
        const unwatch = client.watchContractEvent({
          abi: erc20Abi,
          address: collateralToken.address,
          eventName: "Approval",
          strict: true,
          onLogs(logs) {
            unwatch();
            expect(logs.length).toBe(1);
            resolve(logs[0]);
          },
        });
      }),
    ]);

    expect(approval.args.owner).toBe(account);
    expect(approval.args.spender).toBe(morphoAddress);
    expect(approval.args.value).toBe(amount);

    await waitFor(() => screen.findByText("Supply Collateral"), { timeout: 10_000 });

    // Wait for supply to be automined
    const [, supply] = await Promise.all([
      userEvent.click(screen.getByText("Supply Collateral")),
      new Promise<SupplyLog>((resolve) => {
        const unwatch = client.watchContractEvent({
          abi: morphoAbi,
          address: morphoAddress,
          eventName: "SupplyCollateral",
          strict: true,
          onLogs(logs) {
            unwatch();
            expect(logs.length).toBe(1);
            resolve(logs[0]);
          },
        });
      }),
    ]);

    expect(supply.args.id).toBe(marketId);
    expect(supply.args.caller).toBe(account);
    expect(supply.args.onBehalf).toBe(account);
    expect(supply.args.assets).toBe(amount);
  });
});

describe("withdraw collateral flow", () => {
  testWithPolygonFork("encodes withdraw collateral correctly", async ({ client }) => {
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

    const market = await fetchMarket(client as unknown as PublicClient);
    const amountText = "1.2";
    const amount = parseUnits(amountText, collateralToken.decimals!);

    await client.deal({ account, amount: parseEther("0.1") }); // for gas
    await client.deal({ account, amount, erc20: collateralToken.address });
    await client.impersonateAccount({ address: account });
    await client.approve({ account, address: collateralToken.address, args: [morphoAddress, amount] });
    await client.writeContract({
      account,
      abi: morphoAbi,
      address: morphoAddress,
      functionName: "supplyCollateral",
      args: [{ ...market.params }, amount, account, "0x"],
    });

    render(
      <TestableBorrowSheetContent
        marketId={marketId}
        marketParams={market.params}
        imarket={market}
        tokens={
          new Map([
            [loanToken.address, loanToken],
            [collateralToken.address, collateralToken],
          ])
        }
      />,
      { wagmiConfig },
    );

    // Wait for tabs -- this implies the `Testable` wrapper has connected the mock account
    await waitFor(() => screen.findAllByRole("tab"));
    const tabs = screen.getAllByRole("tab");
    await userEvent.click(tabs.find((tab) => tab.textContent === "Withdraw")!);

    const inputField = screen.getByPlaceholderText("0");
    expect(inputField).toBeInTheDocument();
    await userEvent.type(inputField, amountText);

    await waitFor(() => screen.findByText("Withdraw Collateral"), { timeout: 10_000 });

    // Wait for withdraw to be automined
    const [, withdraw] = await Promise.all([
      userEvent.click(screen.getByText("Withdraw Collateral")),
      new Promise<WithdrawLog>((resolve) => {
        const unwatch = client.watchContractEvent({
          abi: morphoAbi,
          address: morphoAddress,
          eventName: "WithdrawCollateral",
          strict: true,
          onLogs(logs) {
            unwatch();
            expect(logs.length).toBe(1);
            resolve(logs[0]);
          },
        });
      }),
    ]);

    expect(withdraw.args.id).toBe(marketId);
    expect(withdraw.args.caller).toBe(account);
    expect(withdraw.args.onBehalf).toBe(account);
    expect(withdraw.args.assets).toBe(amount);
  });
});

describe("repay flow", () => {
  testWithPolygonFork("encodes repay correctly", async ({ client }) => {
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

    const market = await fetchMarket(client as unknown as PublicClient);
    const collateralAmount = parseUnits("1.2", collateralToken.decimals!);
    const loanAmount = parseUnits("0.01", loanToken.decimals!);
    const repayAmountText = "0.005";
    const repayAmount = parseUnits(repayAmountText, loanToken.decimals!);

    await client.deal({ account, amount: parseEther("0.1") }); // for gas
    await client.deal({ account, amount: collateralAmount, erc20: collateralToken.address });
    await client.impersonateAccount({ address: account });
    await client.approve({ account, address: collateralToken.address, args: [morphoAddress, collateralAmount] });
    await client.writeContract({
      account,
      abi: morphoAbi,
      address: morphoAddress,
      functionName: "supplyCollateral",
      args: [{ ...market.params }, collateralAmount, account, "0x"],
    });
    await client.writeContract({
      account,
      abi: morphoAbi,
      address: morphoAddress,
      functionName: "borrow",
      args: [{ ...market.params }, loanAmount, 0n, account, account],
    });

    render(
      <TestableBorrowSheetContent
        marketId={marketId}
        marketParams={market.params}
        imarket={market}
        tokens={
          new Map([
            [loanToken.address, loanToken],
            [collateralToken.address, collateralToken],
          ])
        }
      />,
      { wagmiConfig },
    );

    // Wait for tabs -- this implies the `Testable` wrapper has connected the mock account
    await waitFor(() => screen.findAllByRole("tab"));
    const tabs = screen.getAllByRole("tab");
    await userEvent.click(tabs.find((tab) => tab.textContent === "Repay")!);

    const inputField = screen.getByPlaceholderText("0");
    expect(inputField).toBeInTheDocument();
    await userEvent.type(inputField, repayAmountText);

    await waitFor(() => screen.findAllByRole("button", { name: "Approve" }), { timeout: 10_000 });

    // Wait for approval to be automined
    const [, approval] = await Promise.all([
      userEvent.click(screen.getByText("Approve")),
      new Promise<ApprovalLog>((resolve) => {
        const unwatch = client.watchContractEvent({
          abi: erc20Abi,
          address: loanToken.address,
          eventName: "Approval",
          strict: true,
          onLogs(logs) {
            unwatch();
            expect(logs.length).toBe(1);
            resolve(logs[0]);
          },
        });
      }),
    ]);

    expect(approval.args.owner).toBe(account);
    expect(approval.args.spender).toBe(morphoAddress);
    expect(approval.args.value).toBe(repayAmount);

    await waitFor(() => screen.findAllByRole("button", { name: "Repay" }), { timeout: 10_000 });

    // Wait for repay to be automined
    const [, repay] = await Promise.all([
      userEvent.click(screen.getByRole("button", { name: "Repay" })),
      new Promise<RepayLog>((resolve) => {
        const unwatch = client.watchContractEvent({
          abi: morphoAbi,
          address: morphoAddress,
          eventName: "Repay",
          strict: true,
          onLogs(logs) {
            unwatch();
            expect(logs.length).toBe(1);
            resolve(logs[0]);
          },
        });
      }),
    ]);

    expect(repay.args.id).toBe(marketId);
    expect(repay.args.caller).toBe(account);
    expect(repay.args.onBehalf).toBe(account);
    expect(repay.args.assets).toBe(repayAmount);
  });

  testWithPolygonFork("encodes repay max correctly", async ({ client }) => {
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

    const market = await fetchMarket(client as unknown as PublicClient);
    const collateralAmount = parseUnits("1.2", collateralToken.decimals!);
    const loanAmount = parseUnits("0.01", loanToken.decimals!);

    await client.deal({ account, amount: parseEther("0.1") }); // for gas
    await client.deal({ account, amount: collateralAmount, erc20: collateralToken.address });
    await client.deal({ account, amount: loanAmount / 1000n, erc20: loanToken.address });
    await client.impersonateAccount({ address: account });
    await client.approve({ account, address: collateralToken.address, args: [morphoAddress, collateralAmount] });
    await client.writeContract({
      account,
      abi: morphoAbi,
      address: morphoAddress,
      functionName: "supplyCollateral",
      args: [{ ...market.params }, collateralAmount, account, "0x"],
    });
    await client.writeContract({
      account,
      abi: morphoAbi,
      address: morphoAddress,
      functionName: "borrow",
      args: [{ ...market.params }, loanAmount, 0n, account, account],
    });
    const [, repayShares] = await client.readContract({
      abi: morphoAbi,
      address: morphoAddress,
      functionName: "position",
      args: [marketId, account],
    });

    render(
      <TestableBorrowSheetContent
        marketId={marketId}
        marketParams={market.params}
        imarket={market}
        tokens={
          new Map([
            [loanToken.address, loanToken],
            [collateralToken.address, collateralToken],
          ])
        }
      />,
      { wagmiConfig },
    );

    // Wait for tabs -- this implies the `Testable` wrapper has connected the mock account
    await waitFor(() => screen.findAllByRole("tab"));
    const tabs = screen.getAllByRole("tab");
    await userEvent.click(tabs.find((tab) => tab.textContent === "Repay")!);

    const inputField = screen.getByPlaceholderText("0");
    expect(inputField).toBeInTheDocument();

    await waitFor(() => screen.findAllByText("MAX"), { timeout: 10_000 });
    await userEvent.click(screen.getByText("MAX"));

    await waitFor(() => screen.findAllByRole("button", { name: "Approve" }), { timeout: 10_000 });

    // Wait for approval to be automined
    const approval = await new Promise<ApprovalLog>((resolve) => {
      const unwatch = client.watchContractEvent({
        abi: erc20Abi,
        address: loanToken.address,
        eventName: "Approval",
        strict: true,
        onLogs(logs) {
          unwatch();
          expect(logs.length).toBe(1);
          resolve(logs[0]);
        },
      });
      void userEvent.click(screen.getByText("Approve"));
    });

    expect(approval.args.owner).toBe(account);
    expect(approval.args.spender).toBe(morphoAddress);
    expect(approval.args.value).toBe(10009997787393201n); // > 0.01 because of share growth buffer

    await waitFor(() => screen.findAllByRole("button", { name: "Repay" }), { timeout: 10_000 });

    // Wait for repay to be automined
    const repay = await new Promise<RepayLog>((resolve) => {
      const unwatch = client.watchContractEvent({
        abi: morphoAbi,
        address: morphoAddress,
        eventName: "Repay",
        strict: true,
        onLogs(logs) {
          unwatch();
          expect(logs.length).toBe(1);
          resolve(logs[0]);
        },
      });
      void userEvent.click(screen.getByRole("button", { name: "Repay" }));
    });

    expect(repay.args.id).toBe(marketId);
    expect(repay.args.caller).toBe(account);
    expect(repay.args.onBehalf).toBe(account);
    expect(repay.args.shares).toBe(repayShares);
  });
});
