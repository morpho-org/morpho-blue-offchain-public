import { AccrualPosition, IMarket, Market, MarketId, MarketParams, Position } from "@morpho-org/blue-sdk";
import { morphoAbi } from "@morpho-org/uikit/assets/abis/morpho";
import { oracleAbi } from "@morpho-org/uikit/assets/abis/oracle";
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
import { formatBalance, formatLtv, Token } from "@morpho-org/uikit/lib/utils";
import { keepPreviousData } from "@tanstack/react-query";
import { CircleArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";
import { Toaster } from "sonner";
import { Address, erc20Abi, extractChain, parseUnits } from "viem";
import { useAccount, useChainId, useChains, useReadContract, useReadContracts } from "wagmi";

enum Actions {
  SupplyCollateral = "Supply",
  WithdrawCollateral = "Withdraw",
  Repay = "Repay",
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
  const chains = useChains();
  const chain = extractChain({ chains, id: chainId });
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
    const token = tokens.get(marketParams[selectedTab === Actions.Repay ? "loanToken" : "collateralToken"]);
    return {
      token,
      inputValue: token?.decimals !== undefined ? parseUnits(textInputValue, token.decimals) : undefined,
    };
  }, [textInputValue, selectedTab, tokens, marketParams]);

  const repayMax = accrualPosition ? accrualPosition.borrowAssets : undefined;
  const isRepayMax = inputValue === repayMax;

  const approvalTxnConfig =
    token !== undefined &&
    inputValue !== undefined &&
    allowances !== undefined &&
    allowances[selectedTab === Actions.Repay ? 1 : 0] < inputValue
      ? ({
          address: token.address,
          abi: erc20Abi,
          functionName: "approve",
          // If `isRepayMax`, the user will repay borrow _shares_ (rather than assets), which
          // grow in value while the txn is processed. This necessitates a small approval buffer.
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
        } as const)
      : undefined;

  const withdrawCollateralTxnConfig =
    inputValue !== undefined && userAddress !== undefined
      ? ({
          address: morpho,
          abi: morphoAbi,
          functionName: "withdrawCollateral",
          args: [{ ...marketParams }, inputValue, userAddress, userAddress],
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
        } as const)
      : undefined;

  const {
    symbol: collateralSymbol,
    decimals: collateralDecimals,
    imageSrc: collateralImgSrc,
  } = tokens.get(marketParams.collateralToken) ?? {};
  const { symbol: loanSymbol, decimals: loanDecimals, imageSrc: loanImgSrc } = tokens.get(marketParams.loanToken) ?? {};

  let withdrawCollateralMax = accrualPosition?.withdrawableCollateral;
  if (withdrawCollateralMax !== undefined) withdrawCollateralMax = (withdrawCollateralMax * 999n) / 1000n; // safety

  return (
    <SheetContent className="z-[9999] gap-3 overflow-y-scroll dark:bg-neutral-900">
      <Toaster theme="dark" position="bottom-left" richColors />
      <SheetHeader>
        <SheetTitle>Your Position</SheetTitle>
        <SheetDescription>
          You can view your position here, and take actions that increase its health. To access all features (including
          borrowing) open this market in the{" "}
          <a
            className="underline"
            href={`https://app.morpho.org/${chain.name.toLowerCase()}/market/${marketId}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            full app.
          </a>
        </SheetDescription>
      </SheetHeader>
      <div className="bg-primary mx-4 flex flex-col gap-4 rounded-2xl p-4">
        <div className={STYLE_LABEL}>
          My collateral position {collateralSymbol ? `(${collateralSymbol})` : ""}
          <img className="rounded-full" height={16} width={16} src={collateralImgSrc} />
        </div>
        <p className="text-lg font-medium">
          {accrualPosition?.collateral !== undefined && collateralDecimals !== undefined
            ? formatBalance(accrualPosition.collateral, collateralDecimals, 5)
            : "－"}
        </p>
        <div className={STYLE_LABEL}>
          My loan position {loanSymbol ? `(${loanSymbol})` : ""}
          <img className="rounded-full" height={16} width={16} src={loanImgSrc} />
        </div>
        <p className="text-lg font-medium">
          {accrualPosition?.borrowAssets !== undefined && loanDecimals !== undefined
            ? formatBalance(accrualPosition.borrowAssets, loanDecimals, 5)
            : "－"}
        </p>
        <div className={STYLE_LABEL}>LTV / Liquidation LTV</div>
        <p className="text-lg font-medium">
          {accrualPosition?.ltv ? formatLtv(accrualPosition.ltv) : "－"} / {formatLtv(marketParams.lltv)}
        </p>
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
        <TabsList className="grid w-full grid-cols-3 gap-1 bg-transparent p-0">
          <TabsTrigger className={STYLE_TAB} value={Actions.SupplyCollateral}>
            {Actions.SupplyCollateral}
          </TabsTrigger>
          <TabsTrigger className={STYLE_TAB} value={Actions.WithdrawCollateral}>
            {Actions.WithdrawCollateral}
          </TabsTrigger>
          <TabsTrigger className={STYLE_TAB} value={Actions.Repay}>
            {Actions.Repay}
          </TabsTrigger>
        </TabsList>
        <TabsContent value={Actions.SupplyCollateral}>
          <div className={STYLE_INPUT_WRAPPER}>
            <div className={STYLE_INPUT_HEADER}>
              Supply Collateral {collateralSymbol ?? ""}
              <img className="rounded-full" height={16} width={16} src={collateralImgSrc} />
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
              Withdraw Collateral {collateralSymbol ?? ""}
              <img className="rounded-full" height={16} width={16} src={collateralImgSrc} />
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
        <TabsContent value={Actions.Repay}>
          <div className={STYLE_INPUT_WRAPPER}>
            <div className={STYLE_INPUT_HEADER}>
              Repay Loan {loanSymbol ?? ""}
              <img className="rounded-full" height={16} width={16} src={loanImgSrc} />
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
