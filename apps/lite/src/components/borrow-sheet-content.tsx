import { AccrualPosition, IMarket, Market, MarketId, MarketParams, Position } from "@morpho-org/blue-sdk";
import { morphoAbi } from "@morpho-org/uikit/assets/abis/morpho";
import { oracleAbi } from "@morpho-org/uikit/assets/abis/oracle";
import { AnimateIn } from "@morpho-org/uikit/components/animate-in";
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
import { getContractDeploymentInfo } from "@morpho-org/uikit/lib/deployments";
import { tryFormatBalance, formatLtv, Token } from "@morpho-org/uikit/lib/utils";
import { keepPreviousData } from "@tanstack/react-query";
import { ArrowRight, CircleArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { Toaster } from "sonner";
import { Address, erc20Abi, parseUnits } from "viem";
import { useAccount, useChainId, useReadContract, useReadContracts } from "wagmi";

import { RISKS_DOCUMENTATION, TRANSACTION_DATA_SUFFIX } from "@/lib/constants";

enum Actions {
  SupplyCollateral = "Supply",
  WithdrawCollateral = "Withdraw",
  Borrow = "Borrow",
  Repay = "Repay",
}

function PositionProperty({ current, updated }: { current: string; updated?: string }) {
  if (updated === undefined || current === updated) {
    return <p className="text-lg font-medium">{current}</p>;
  }
  return (
    <div className="flex items-center gap-1">
      <p className="text-tertiary-foreground text-lg font-medium">{current}</p>
      <AnimateIn
        className="flex items-center gap-1"
        from="opacity-0 translate-x-[-16px]"
        duration={250}
        to="opacity-100 translate-x-[0px]"
        style={{ transitionTimingFunction: "cubic-bezier(0.25, 0.4, 0.55, 1.4)" }}
      >
        <ArrowRight height={16} width={16} className="text-tertiary-foreground" />
        <p>{updated}</p>
      </AnimateIn>
    </div>
  );
}

const STYLE_LABEL = "text-secondary-foreground flex items-center justify-between text-xs font-light";
const STYLE_TAB = "hover:bg-tertiary rounded-full duration-200 ease-in-out";
const STYLE_INPUT_WRAPPER =
  "bg-primary hover:bg-secondary flex flex-col gap-4 rounded-2xl p-4 transition-colors duration-200 ease-in-out";
const STYLE_INPUT_HEADER = "text-secondary-foreground flex items-center justify-between text-xs font-light";

export function BorrowSheetContent({
  marketId,
  marketParams,
  imarket,
  tokens,
}: {
  marketId: MarketId;
  marketParams: MarketParams;
  imarket?: IMarket;
  tokens: Map<Address, Token>;
}) {
  const chainId = useChainId();
  const { address: userAddress } = useAccount();

  const [selectedTab, setSelectedTab] = useState(Actions.SupplyCollateral);
  const [textInputValue, setTextInputValue] = useState("");

  const morpho = getContractDeploymentInfo(chainId, "Morpho").address;

  const { data: positionRaw, refetch: refetchPosition } = useReadContract({
    address: morpho,
    abi: morphoAbi,
    functionName: "position",
    args: userAddress ? [marketId, userAddress] : undefined,
    query: { staleTime: 1 * 60 * 1000, placeholderData: keepPreviousData },
  });

  const { data: price } = useReadContract({
    address: marketParams.oracle,
    abi: oracleAbi,
    functionName: "price",
    query: { staleTime: 1 * 60 * 1000, placeholderData: keepPreviousData, refetchInterval: 1 * 60 * 1000 },
  });

  const { data: allowances, refetch: refetchAllowances } = useReadContracts({
    contracts: [
      {
        address: marketParams.collateralToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [userAddress ?? "0x", morpho],
      },
      {
        address: marketParams.loanToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [userAddress ?? "0x", morpho],
      },
    ],
    allowFailure: false,
    query: { enabled: !!userAddress, staleTime: 5_000, gcTime: 5_000 },
  });

  const market = useMemo(
    () => (imarket && price !== undefined ? new Market({ ...imarket, price }) : undefined),
    [imarket, price],
  );

  const position = useMemo(
    () =>
      userAddress && positionRaw
        ? new Position({
            user: userAddress,
            marketId,
            supplyShares: positionRaw[0],
            borrowShares: positionRaw[1],
            collateral: positionRaw[2],
          })
        : undefined,
    [userAddress, marketId, positionRaw],
  );

  const accrualPosition = useMemo(
    () =>
      market && position
        ? new AccrualPosition(position, market).accrueInterest(BigInt((Date.now() / 1000).toFixed(0)))
        : undefined,
    [position, market],
  );

  const { token, inputValue } = useMemo(() => {
    const token = tokens.get(
      marketParams[[Actions.Borrow, Actions.Repay].includes(selectedTab) ? "loanToken" : "collateralToken"],
    );
    return {
      token,
      inputValue: token?.decimals !== undefined ? parseUnits(textInputValue, token.decimals) : undefined,
    };
  }, [textInputValue, selectedTab, tokens, marketParams]);

  let withdrawCollateralMax = accrualPosition?.withdrawableCollateral;
  if (withdrawCollateralMax !== undefined && accrualPosition!.borrowAssets > 0n) {
    withdrawCollateralMax = (withdrawCollateralMax * 999n) / 1000n; // safety since interest is accruing
  }
  const borrowMax = accrualPosition?.maxBorrowableAssets;
  const repayMax = accrualPosition ? accrualPosition.borrowAssets : undefined;
  const isRepayMax = inputValue === repayMax;

  const approvalTxnConfig =
    token !== undefined &&
    inputValue !== undefined &&
    allowances !== undefined &&
    allowances[[Actions.Borrow, Actions.Repay].includes(selectedTab) ? 1 : 0] < inputValue
      ? ({
          address: token.address,
          abi: erc20Abi,
          functionName: "approve",
          args: [morpho, isRepayMax ? (inputValue * 1001n) / 1000n : inputValue],
        } as const)
      : undefined;

  const supplyCollateralTxnConfig =
    inputValue !== undefined && userAddress !== undefined
      ? ({
          address: morpho,
          abi: morphoAbi,
          functionName: "supplyCollateral",
          args: [{ ...marketParams }, inputValue, userAddress, "0x"],
          dataSuffix: TRANSACTION_DATA_SUFFIX,
        } as const)
      : undefined;

  const withdrawCollateralTxnConfig =
    inputValue !== undefined && userAddress !== undefined
      ? ({
          address: morpho,
          abi: morphoAbi,
          functionName: "withdrawCollateral",
          args: [{ ...marketParams }, inputValue, userAddress, userAddress],
          dataSuffix: TRANSACTION_DATA_SUFFIX,
        } as const)
      : undefined;

  const borrowTxnConfig =
    inputValue !== undefined && userAddress !== undefined
      ? ({
          address: morpho,
          abi: morphoAbi,
          functionName: "borrow",
          args: [{ ...marketParams }, inputValue, 0n, userAddress, userAddress],
          dataSuffix: TRANSACTION_DATA_SUFFIX,
        } as const)
      : undefined;

  const repayTxnConfig =
    inputValue !== undefined && userAddress !== undefined
      ? ({
          address: morpho,
          abi: morphoAbi,
          functionName: "repay",
          args:
            isRepayMax && position !== undefined
              ? ([{ ...marketParams }, 0n, position.borrowShares, userAddress, "0x"] as const) // max repay with shares
              : ([{ ...marketParams }, inputValue, 0n, userAddress, "0x"] as const), // normal repay with assets
          dataSuffix: TRANSACTION_DATA_SUFFIX,
        } as const)
      : undefined;

  const {
    symbol: collateralSymbol,
    decimals: collateralDecimals,
    imageSrc: collateralImgSrc,
  } = tokens.get(marketParams.collateralToken) ?? {};
  const { symbol: loanSymbol, decimals: loanDecimals, imageSrc: loanImgSrc } = tokens.get(marketParams.loanToken) ?? {};

  let newAccrualPosition: AccrualPosition | undefined = undefined;
  let error: Error | null = null;
  if (accrualPosition && inputValue) {
    try {
      switch (selectedTab) {
        case Actions.SupplyCollateral:
          newAccrualPosition = new AccrualPosition(
            accrualPosition,
            new Market(accrualPosition.market),
          ).supplyCollateral(inputValue);
          break;
        case Actions.WithdrawCollateral:
          newAccrualPosition = new AccrualPosition(
            accrualPosition,
            new Market(accrualPosition.market),
          ).withdrawCollateral(inputValue);
          break;
        case Actions.Borrow:
          newAccrualPosition = new AccrualPosition(accrualPosition, new Market(accrualPosition.market)).borrow(
            inputValue,
            0n,
          ).position;
          break;
        case Actions.Repay:
          newAccrualPosition = new AccrualPosition(accrualPosition, new Market(accrualPosition.market)).repay(
            isRepayMax ? 0n : inputValue,
            isRepayMax ? position!.borrowShares : 0n,
          ).position;
          break;
      }
    } catch (e) {
      error = e as Error;
    }
  }

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
          My collateral position {collateralSymbol ? `(${collateralSymbol})` : ""}
          <img className="max-h-[16px] rounded-full" height={16} width={16} src={collateralImgSrc} />
        </div>
        <PositionProperty
          current={tryFormatBalance(accrualPosition?.collateral, collateralDecimals, 5) ?? "－"}
          updated={tryFormatBalance(newAccrualPosition?.collateral, collateralDecimals, 5)}
        />
        <div className={STYLE_LABEL}>
          My loan position {loanSymbol ? `(${loanSymbol})` : ""}
          <img className="max-h-[16px] rounded-full" height={16} width={16} src={loanImgSrc} />
        </div>
        <PositionProperty
          current={tryFormatBalance(accrualPosition?.borrowAssets, loanDecimals) ?? "－"}
          updated={tryFormatBalance(newAccrualPosition?.borrowAssets, loanDecimals)}
        />
        <div className={STYLE_LABEL}>LTV / Liquidation LTV</div>
        <PositionProperty
          current={`${accrualPosition?.ltv !== undefined ? formatLtv(accrualPosition.ltv ?? 0n) : "－"} / ${formatLtv(marketParams.lltv)}`}
          updated={
            newAccrualPosition &&
            `${newAccrualPosition?.ltv !== undefined ? formatLtv(newAccrualPosition.ltv ?? 0n) : "－"} / ${formatLtv(marketParams.lltv)}`
          }
        />
      </div>
      <Tabs
        defaultValue={Actions.SupplyCollateral}
        className="w-full gap-3 px-4"
        value={selectedTab}
        onValueChange={(value) => {
          setSelectedTab(value as Actions);
          setTextInputValue("");
        }}
      >
        <TabsList className="grid w-full grid-cols-4 gap-1 bg-transparent p-0">
          <TabsTrigger className={STYLE_TAB} value={Actions.SupplyCollateral}>
            {Actions.SupplyCollateral}
          </TabsTrigger>
          <TabsTrigger className={STYLE_TAB} value={Actions.WithdrawCollateral}>
            {Actions.WithdrawCollateral}
          </TabsTrigger>
          <TabsTrigger className={STYLE_TAB} value={Actions.Borrow}>
            {Actions.Borrow}
          </TabsTrigger>
          <TabsTrigger className={STYLE_TAB} value={Actions.Repay}>
            {Actions.Repay}
          </TabsTrigger>
        </TabsList>
        <TabsContent value={Actions.SupplyCollateral}>
          <div className={STYLE_INPUT_WRAPPER}>
            <div className={STYLE_INPUT_HEADER}>
              Supply Collateral {token?.symbol ?? ""}
              <img className="max-h-[16px] rounded-full" height={16} width={16} src={token?.imageSrc} />
            </div>
            <TokenAmountInput decimals={token?.decimals} value={textInputValue} onChange={setTextInputValue} />
          </div>
          {approvalTxnConfig ? (
            <TransactionButton
              variables={approvalTxnConfig}
              disabled={inputValue === 0n}
              onTxnReceipt={() => refetchAllowances()}
            >
              Approve
            </TransactionButton>
          ) : (
            <TransactionButton
              variables={supplyCollateralTxnConfig}
              disabled={!inputValue}
              onTxnReceipt={() => {
                setTextInputValue("");
                void refetchPosition();
              }}
            >
              Supply Collateral
            </TransactionButton>
          )}
        </TabsContent>
        <TabsContent value={Actions.WithdrawCollateral}>
          <div className={STYLE_INPUT_WRAPPER}>
            <div className={STYLE_INPUT_HEADER}>
              Withdraw Collateral {token?.symbol ?? ""}
              <img className="max-h-[16px] rounded-full" height={16} width={16} src={token?.imageSrc} />
            </div>
            <TokenAmountInput
              decimals={token?.decimals}
              value={textInputValue}
              maxValue={withdrawCollateralMax}
              onChange={setTextInputValue}
            />
          </div>
          <TransactionButton
            variables={withdrawCollateralTxnConfig}
            disabled={!inputValue}
            onTxnReceipt={() => {
              setTextInputValue("");
              void refetchPosition();
            }}
          >
            Withdraw Collateral
          </TransactionButton>
        </TabsContent>
        <TabsContent value={Actions.Borrow}>
          <div className={STYLE_INPUT_WRAPPER}>
            <div className={STYLE_INPUT_HEADER}>
              Borrow {token?.symbol ?? ""}
              <img className="max-h-[16px] rounded-full" height={16} width={16} src={token?.imageSrc} />
            </div>
            <TokenAmountInput
              decimals={token?.decimals}
              value={textInputValue}
              maxValue={borrowMax}
              onChange={setTextInputValue}
            />
          </div>
          <TransactionButton
            variables={borrowTxnConfig}
            disabled={!inputValue}
            onTxnReceipt={() => {
              setTextInputValue("");
              void refetchPosition();
            }}
          >
            Borrow
          </TransactionButton>
        </TabsContent>
        <TabsContent value={Actions.Repay}>
          <div className={STYLE_INPUT_WRAPPER}>
            <div className={STYLE_INPUT_HEADER}>
              Repay {token?.symbol ?? ""}
              <img className="max-h-[16px] rounded-full" height={16} width={16} src={token?.imageSrc} />
            </div>
            <TokenAmountInput
              decimals={token?.decimals}
              value={textInputValue}
              maxValue={repayMax}
              onChange={setTextInputValue}
            />
          </div>
          {approvalTxnConfig ? (
            <TransactionButton
              variables={approvalTxnConfig}
              disabled={inputValue === 0n}
              onTxnReceipt={() => refetchAllowances()}
            >
              Approve
            </TransactionButton>
          ) : (
            <TransactionButton
              variables={repayTxnConfig}
              disabled={!inputValue}
              onTxnReceipt={() => {
                setTextInputValue("");
                void refetchPosition();
              }}
            >
              Repay
            </TransactionButton>
          )}
        </TabsContent>
      </Tabs>
      <p className="break-words px-12 text-center text-xs text-red-500">{error?.message}</p>
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
