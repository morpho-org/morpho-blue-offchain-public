import { morphoAbi } from "@morpho-blue-offchain-public/uikit/assets/abis/morpho";
import { Avatar, AvatarFallback, AvatarImage } from "@morpho-blue-offchain-public/uikit/components/shadcn/avatar";
import { Card, CardContent } from "@morpho-blue-offchain-public/uikit/components/shadcn/card";
import { Progress } from "@morpho-blue-offchain-public/uikit/components/shadcn/progress";
import { Sheet, SheetTrigger } from "@morpho-blue-offchain-public/uikit/components/shadcn/sheet";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@morpho-blue-offchain-public/uikit/components/shadcn/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@morpho-blue-offchain-public/uikit/components/shadcn/tooltip";
import useContractEvents from "@morpho-blue-offchain-public/uikit/hooks/use-contract-events/use-contract-events";
import {
  abbreviateAddress,
  formatBalanceWithSymbol,
  formatLtv,
  getTokenSymbolURI,
  Token,
} from "@morpho-blue-offchain-public/uikit/lib/utils";
import { MarketId, MarketParams, MarketUtils } from "@morpho-org/blue-sdk";
import { keepPreviousData } from "@tanstack/react-query";
import { blo } from "blo";
import { Eye, Info } from "lucide-react";
import { useMemo } from "react";
import { Address, erc20Abi } from "viem";
import { useAccount, useReadContracts } from "wagmi";

import { BorrowSheetContent } from "@/components/borrow-sheet-content";
import { CtaCard } from "@/components/cta-card";
import { RequestChart } from "@/components/request-chart";
import { getContractDeploymentInfo } from "@/lib/constants";

function TokenTableCell({ address, symbol, imageSrc }: Token) {
  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-4 w-4 rounded-sm">
        <AvatarImage src={imageSrc} alt="Avatar" />
        <AvatarFallback delayMs={500}>
          <img src={blo(address)} />
        </AvatarFallback>
      </Avatar>
      {symbol ?? "－"}
      <span className="text-primary/30 font-mono">{abbreviateAddress(address)}</span>
    </div>
  );
}

export function BorrowSubPage() {
  const { chainId, address: userAddress } = useAccount();

  const urlSearchParams = new URLSearchParams(window.location.search);
  const isDev = urlSearchParams.has("dev");

  const morpho = useMemo(() => getContractDeploymentInfo(chainId, "Morpho"), [chainId]);

  const {
    logs: { all: supplyCollateralEvents },
    isFetching: isFetchingSupplyCollateralEvents,
    fractionFetched: ffSupplyCollateralEvents,
  } = useContractEvents({
    chainId,
    abi: morphoAbi,
    address: morpho?.address,
    fromBlock: morpho?.fromBlock,
    reverseChronologicalOrder: true,
    eventName: "SupplyCollateral",
    args: { onBehalf: userAddress },
    strict: true,
    query: {
      enabled: chainId !== undefined && userAddress !== undefined,
    },
  });

  const marketIds = useMemo(() => {
    // Get unique set of all marketIds the user has interacted with
    const ids = Array.from(new Set(supplyCollateralEvents.map((ev) => ev.args.id)));
    // Sort them so that queryKey is consistent in the `useReadContracts` hooks below
    ids.sort();
    return ids;
  }, [supplyCollateralEvents]);

  const { data: marketParamsRaw, isFetching: isFetchingMarketParams } = useReadContracts({
    contracts: marketIds.map(
      (marketId) =>
        ({
          chainId,
          address: morpho?.address ?? "0x",
          abi: morphoAbi,
          functionName: "idToMarketParams",
          args: [marketId],
        }) as const,
    ),
    allowFailure: false,
    query: { staleTime: Infinity, gcTime: Infinity, enabled: !!morpho },
  });

  const filteredCreateMarketArgs = useMemo(
    () =>
      marketParamsRaw?.map((raw, idx) => ({
        id: marketIds[idx],
        marketParams: {
          loanToken: raw[0],
          collateralToken: raw[1],
          oracle: raw[2],
          irm: raw[3],
          lltv: raw[4],
        },
      })) ?? [],
    [marketIds, marketParamsRaw],
  );

  const { data: erc20Symbols, isFetching: isFetchingErc20Symbols } = useReadContracts({
    contracts: filteredCreateMarketArgs
      .map((args) => [
        { chainId, address: args.marketParams.collateralToken, abi: erc20Abi, functionName: "symbol" } as const,
        { chainId, address: args.marketParams.loanToken, abi: erc20Abi, functionName: "symbol" } as const,
      ])
      .flat(),
    allowFailure: true,
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  const { data: erc20Decimals, isFetching: isFetchingErc20Decimals } = useReadContracts({
    contracts: filteredCreateMarketArgs
      .map((args) => [
        { chainId, address: args.marketParams.collateralToken, abi: erc20Abi, functionName: "decimals" } as const,
        { chainId, address: args.marketParams.loanToken, abi: erc20Abi, functionName: "decimals" } as const,
      ])
      .flat(),
    allowFailure: true,
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  const { data: markets, isFetching: isFetchingMarkets } = useReadContracts({
    contracts: filteredCreateMarketArgs.map(
      (args) =>
        ({
          chainId,
          address: morpho?.address ?? "0x",
          abi: morphoAbi,
          functionName: "market",
          args: [args.id],
        }) as const,
    ),
    allowFailure: false,
    query: { staleTime: 10 * 60 * 1000, gcTime: Infinity, placeholderData: keepPreviousData, enabled: !!morpho },
  });

  const { data: positionsRaw, refetch: refetchPositionsRaw } = useReadContracts({
    contracts: filteredCreateMarketArgs.map(
      (args) =>
        ({
          chainId,
          address: morpho?.address ?? "0x",
          abi: morphoAbi,
          functionName: "position",
          args: userAddress ? [args.id, userAddress] : undefined,
        }) as const,
    ),
    allowFailure: false,
    query: { staleTime: 1 * 60 * 1000, placeholderData: keepPreviousData, enabled: !!morpho },
  });

  const tokens = useMemo(() => {
    const map = new Map<Address, Token>();
    filteredCreateMarketArgs.forEach((args, idx) => {
      const collateralTokenSymbol = erc20Symbols?.[idx * 2].result;
      const loanTokenSymbol = erc20Symbols?.[idx * 2 + 1].result;
      map.set(args.marketParams.collateralToken, {
        address: args.marketParams.collateralToken,
        symbol: collateralTokenSymbol,
        decimals: erc20Decimals?.[idx * 2].result,
        imageSrc: getTokenSymbolURI(collateralTokenSymbol),
      });
      map.set(args.marketParams.loanToken, {
        address: args.marketParams.loanToken,
        symbol: loanTokenSymbol,
        decimals: erc20Decimals?.[idx * 2 + 1].result,
        imageSrc: getTokenSymbolURI(loanTokenSymbol),
      });
    });
    return map;
  }, [filteredCreateMarketArgs, erc20Symbols, erc20Decimals]);

  let totalProgress = isFetchingSupplyCollateralEvents
    ? ffSupplyCollateralEvents
    : isFetchingMarketParams
      ? 1
      : isFetchingErc20Symbols
        ? 2
        : isFetchingErc20Decimals
          ? 3
          : isFetchingMarkets
            ? 4
            : 5;
  if (!userAddress) totalProgress = 0;

  const progressCard = (
    <Card className="bg-secondary h-min md:h-full">
      <CardContent className="flex h-full flex-col gap-2 p-6 text-xs font-light">
        <div className="flex justify-between">
          <span>Indexing your positions</span>
          {(ffSupplyCollateralEvents * 100).toFixed(2)}%
        </div>
        <Progress finalColor="bg-green-400" value={ffSupplyCollateralEvents * 100} className="mb-auto" />
        <div className="bottom-0 flex justify-between">
          <i>Total Progress</i>
          {((totalProgress * 100) / 5).toFixed(2)}%
        </div>
        <Progress finalColor="bg-green-400" value={(totalProgress * 100) / 5} />
      </CardContent>
    </Card>
  );

  return (
    <div className="flex min-h-screen flex-col px-2.5">
      {userAddress === undefined ? (
        <CtaCard
          className="flex w-full max-w-5xl flex-col gap-4 px-8 pb-14 pt-24 md:m-auto md:grid md:grid-cols-[50%_50%] md:px-0 md:pt-32 dark:bg-neutral-900"
          bigText="Provide collateral to borrow any asset"
          littleText="Connect wallet to get started"
          videoSrc={{
            mov: "https://cdn.morpho.org/v2/assets/videos/borrow-animation.mov",
            webm: "https://cdn.morpho.org/v2/assets/videos/borrow-animation.webm",
          }}
        />
      ) : isDev ? (
        <div className="flex w-full max-w-5xl flex-col gap-4 px-8 pb-14 pt-24 md:m-auto md:grid md:grid-cols-[40%_60%] md:px-0 md:pt-32 dark:bg-neutral-900">
          {progressCard}
          <RequestChart />
        </div>
      ) : (
        <div className="flex h-96 w-full max-w-5xl flex-col gap-4 px-8 pb-14 pt-24 md:m-auto md:px-0 md:pt-32 dark:bg-neutral-900">
          {progressCard}
        </div>
      )}
      <div className="bg-background dark:bg-background/30 flex grow justify-center rounded-t-xl">
        <div className="text-primary w-full max-w-5xl px-8 pb-32 pt-8">
          <Table className="border-separate border-spacing-y-3">
            <TableCaption>
              Showing markets in which you've opened positions.
              <br />
              Click on a market to manage your position.
            </TableCaption>
            <TableHeader className="bg-secondary">
              <TableRow>
                <TableHead className="text-primary rounded-l-lg pl-4 text-xs font-light">Collateral</TableHead>
                <TableHead className="text-primary text-xs font-light">Loan</TableHead>
                <TableHead className="text-primary text-xs font-light">LLTV</TableHead>
                <TableHead className="text-primary text-xs font-light">Position</TableHead>
                <TableHead className="text-primary rounded-r-lg text-xs font-light">
                  <div className="flex items-center gap-1">
                    Liquidity
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4" />
                        </TooltipTrigger>
                        <TooltipContent className="text-secondary max-w-56 p-3 font-light">
                          This value will be smaller than that of the full app. It doesn't include shared market
                          liquidity which could be reallocated upon borrow.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCreateMarketArgs.map((args, idx) => (
                <Sheet
                  key={args.id}
                  onOpenChange={(isOpen) => {
                    // Refetch positions on sidesheet close, since user may have sent txns to modify one
                    if (!isOpen) void refetchPositionsRaw();
                  }}
                >
                  <SheetTrigger asChild>
                    <TableRow className="bg-secondary">
                      <TableCell className="rounded-l-lg p-5">
                        <TokenTableCell {...tokens.get(args.marketParams.collateralToken)!} />
                      </TableCell>
                      <TableCell>
                        <TokenTableCell {...tokens.get(args.marketParams.loanToken)!} />
                      </TableCell>
                      <TableCell>{formatLtv(args.marketParams.lltv)}</TableCell>
                      <TableCell>
                        {
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Eye className="h-4 w-4" />
                              </TooltipTrigger>
                              <TooltipContent className="text-secondary max-w-56 p-3 font-light">
                                <h3>Collateral</h3>
                                <p>
                                  {positionsRaw && tokens.get(args.marketParams.collateralToken)?.decimals !== undefined
                                    ? formatBalanceWithSymbol(
                                        positionsRaw[idx][2],
                                        tokens.get(args.marketParams.collateralToken)!.decimals!,
                                        tokens.get(args.marketParams.collateralToken)!.symbol,
                                        5,
                                        true,
                                      )
                                    : "－"}
                                </p>
                                <h3 className="pt-3">Borrows</h3>
                                <p>
                                  {markets &&
                                  positionsRaw &&
                                  tokens.get(args.marketParams.loanToken)?.decimals !== undefined
                                    ? formatBalanceWithSymbol(
                                        MarketUtils.toBorrowAssets(positionsRaw[idx][1], {
                                          totalBorrowAssets: markets[idx][2],
                                          totalBorrowShares: markets[idx][3],
                                        }),
                                        tokens.get(args.marketParams.loanToken)!.decimals!,
                                        tokens.get(args.marketParams.loanToken)!.symbol,
                                        5,
                                        true,
                                      )
                                    : "－"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        }
                      </TableCell>
                      <TableCell className="rounded-r-lg">
                        {markets && tokens.get(args.marketParams.loanToken)?.decimals !== undefined
                          ? formatBalanceWithSymbol(
                              markets[idx][0] - markets[idx][2],
                              tokens.get(args.marketParams.loanToken)!.decimals!,
                              tokens.get(args.marketParams.loanToken)!.symbol,
                              5,
                              true,
                            )
                          : "－"}
                      </TableCell>
                    </TableRow>
                  </SheetTrigger>
                  <BorrowSheetContent
                    marketId={args.id as MarketId}
                    marketParams={new MarketParams(args.marketParams)}
                    imarket={
                      markets
                        ? {
                            params: new MarketParams(args.marketParams),
                            totalSupplyAssets: markets[idx][0],
                            totalSupplyShares: markets[idx][1],
                            totalBorrowAssets: markets[idx][2],
                            totalBorrowShares: markets[idx][3],
                            lastUpdate: markets[idx][4],
                            fee: markets[idx][5],
                          }
                        : undefined
                    }
                    tokens={tokens}
                  />
                </Sheet>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
