import { Button } from "@morpho-org/uikit/components/shadcn/button";
import {
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@morpho-org/uikit/components/shadcn/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@morpho-org/uikit/components/shadcn/tabs";
import { TokenAmountInput } from "@morpho-org/uikit/components/token-amount-input";
import { TransactionButton } from "@morpho-org/uikit/components/transaction-button";
import { formatBalance, Token } from "@morpho-org/uikit/lib/utils";
import { keepPreviousData } from "@tanstack/react-query";
import { CircleArrowLeft } from "lucide-react";
import { useState } from "react";
import { Toaster } from "sonner";
import { Address, erc20Abi, erc4626Abi, parseUnits } from "viem";
import { useAccount, useReadContract, useReadContracts } from "wagmi";

import { RISKS_DOCUMENTATION, TRANSACTION_DATA_SUFFIX } from "@/lib/constants";

enum Actions {
  Deposit = "Deposit",
  Withdraw = "Withdraw",
}

const STYLE_LABEL = "text-secondary-foreground flex items-center justify-between text-xs font-light";
const STYLE_TAB = "hover:bg-tertiary rounded-full duration-200 ease-in-out";
const STYLE_INPUT_WRAPPER =
  "bg-primary hover:bg-secondary flex flex-col gap-4 rounded-2xl p-4 transition-colors duration-200 ease-in-out";
const STYLE_INPUT_HEADER = "text-secondary-foreground flex items-center justify-between text-xs font-light";

export function EarnSheetContent({ vaultAddress, asset }: { vaultAddress: Address; asset: Token }) {
  const { address: userAddress } = useAccount();

  const [selectedTab, setSelectedTab] = useState(Actions.Deposit);
  const [textInputValue, setTextInputValue] = useState("");

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: asset.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: [userAddress ?? "0x", vaultAddress],
    query: { enabled: !!userAddress, staleTime: 5_000, gcTime: 5_000 },
  });

  const { data: maxes, refetch: refetchMaxes } = useReadContracts({
    contracts: [
      { address: vaultAddress, abi: erc4626Abi, functionName: "maxWithdraw", args: [userAddress ?? "0x"] },
      { address: vaultAddress, abi: erc4626Abi, functionName: "maxRedeem", args: [userAddress ?? "0x"] },
      { address: asset.address, abi: erc20Abi, functionName: "balanceOf", args: [userAddress ?? "0x"] },
    ],
    allowFailure: false,
    query: { enabled: !!userAddress, staleTime: 1 * 60 * 1000, placeholderData: keepPreviousData },
  });

  const inputValue = asset.decimals !== undefined ? parseUnits(textInputValue, asset.decimals) : undefined;
  const isMaxed = inputValue === maxes?.[0];

  const approvalTxnConfig =
    userAddress !== undefined && inputValue !== undefined && allowance !== undefined && allowance < inputValue
      ? ({
          address: asset.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [vaultAddress, inputValue],
        } as const)
      : undefined;

  const depositTxnConfig =
    userAddress !== undefined && inputValue !== undefined
      ? ({
          address: vaultAddress,
          abi: erc4626Abi,
          functionName: "deposit",
          args: [inputValue, userAddress],
          dataSuffix: TRANSACTION_DATA_SUFFIX,
        } as const)
      : undefined;

  const withdrawTxnConfig =
    userAddress !== undefined && inputValue !== undefined
      ? isMaxed
        ? ({
            address: vaultAddress,
            abi: erc4626Abi,
            functionName: "redeem",
            args: [maxes![1], userAddress, userAddress],
            dataSuffix: TRANSACTION_DATA_SUFFIX,
          } as const)
        : ({
            address: vaultAddress,
            abi: erc4626Abi,
            functionName: "withdraw",
            args: [inputValue, userAddress, userAddress],
            dataSuffix: TRANSACTION_DATA_SUFFIX,
          } as const)
      : undefined;

  return (
    <SheetContent className="bg-background z-[9999] w-full gap-3 overflow-y-scroll sm:w-[500px] sm:min-w-[500px] sm:max-w-[500px]">
      <Toaster theme="dark" position="bottom-left" richColors />
      <SheetHeader>
        <SheetTitle>Your Position</SheetTitle>
        <SheetDescription>
          You can view and edit your position here. To understand more about risks, please visit our{" "}
          <a className="underline" href={RISKS_DOCUMENTATION} rel="noopener noreferrer" target="_blank">
            docs.
          </a>
        </SheetDescription>
      </SheetHeader>
      <div className="bg-primary mx-4 flex flex-col gap-4 rounded-2xl p-4">
        <div className={STYLE_LABEL}>
          My position {asset.symbol ? `(${asset.symbol})` : ""}
          <img className="rounded-full" height={16} width={16} src={asset.imageSrc} />
        </div>
        <p className="text-lg font-medium">
          {maxes !== undefined && asset.decimals !== undefined ? formatBalance(maxes[0], asset.decimals, 5) : "－"}
        </p>
      </div>
      <Tabs
        defaultValue={Actions.Deposit}
        className="w-full gap-3 px-4"
        value={selectedTab}
        onValueChange={(value) => {
          setSelectedTab(value as Actions);
          setTextInputValue("");
        }}
      >
        <TabsList className="grid w-full grid-cols-2 gap-1 bg-transparent p-0">
          <TabsTrigger className={STYLE_TAB} value={Actions.Deposit}>
            {Actions.Deposit}
          </TabsTrigger>
          <TabsTrigger className={STYLE_TAB} value={Actions.Withdraw}>
            {Actions.Withdraw}
          </TabsTrigger>
        </TabsList>
        <TabsContent value={Actions.Deposit}>
          <div className={STYLE_INPUT_WRAPPER}>
            <div className={STYLE_INPUT_HEADER}>
              Deposit {asset.symbol ?? ""}
              <img className="rounded-full" height={16} width={16} src={asset.imageSrc} />
            </div>
            <TokenAmountInput
              decimals={asset.decimals}
              value={textInputValue}
              maxValue={maxes?.[2]}
              onChange={setTextInputValue}
            />
          </div>
          {approvalTxnConfig ? (
            <TransactionButton
              variables={approvalTxnConfig}
              disabled={inputValue === 0n}
              onTxnReceipt={() => refetchAllowance()}
            >
              Approve
            </TransactionButton>
          ) : (
            <TransactionButton
              variables={depositTxnConfig}
              disabled={!inputValue}
              onTxnReceipt={() => {
                setTextInputValue("");
                void refetchMaxes();
              }}
            >
              Deposit
            </TransactionButton>
          )}
        </TabsContent>
        <TabsContent value={Actions.Withdraw}>
          <div className={STYLE_INPUT_WRAPPER}>
            <div className={STYLE_INPUT_HEADER}>
              Withdraw {asset.symbol ?? ""}
              <img className="rounded-full" height={16} width={16} src={asset.imageSrc} />
            </div>
            <TokenAmountInput
              decimals={asset.decimals}
              value={textInputValue}
              maxValue={maxes?.[0]}
              onChange={setTextInputValue}
            />
          </div>
          <TransactionButton
            variables={withdrawTxnConfig}
            disabled={!inputValue}
            onTxnReceipt={() => {
              setTextInputValue("");
              void refetchMaxes();
            }}
          >
            Withdraw
          </TransactionButton>
        </TabsContent>
      </Tabs>
      <SheetFooter>
        <SheetClose asChild>
          <Button className="text-md h-12 w-full rounded-full font-light" type="submit">
            <CircleArrowLeft />
            Back to list
          </Button>
        </SheetClose>
      </SheetFooter>
    </SheetContent>
  );
}
