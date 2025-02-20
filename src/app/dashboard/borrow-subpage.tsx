import { morphoAbi } from "@/assets/abis/morpho";
import { getContractDeploymentInfo } from "@/components/constants";
import useContractEvents from "@/hooks/use-contract-events";
import { useMemo } from "react";
import { useAccount, useBlockNumber, useReadContracts } from "wagmi";
import { Address, erc20Abi } from "viem";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarImage } from "@/components/ui/avatar";
import { blo } from "blo";
import { formatBalanceWithSymbol, formatLtv, Token } from "@/lib/utils";
import { Sheet, SheetTrigger } from "@/components/ui/sheet";
import { BorrowSheetContent } from "@/components/borrow-sheet-content";
import { MarketId, MarketParams } from "@morpho-org/blue-sdk";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { keepPreviousData } from "@tanstack/react-query";
import { RequestChart } from "@/components/request-chart";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";

function TokenTableCell({ address, symbol, imageSrc }: Token) {
  return (
    <div className="flex items-center gap-2">
      <Avatar className="h-4 w-4 rounded-sm">
        <AvatarImage src={imageSrc} alt="Avatar" />
      </Avatar>
      {symbol ?? "－"}
      <span className="text-primary/30 font-mono">{`${address.slice(0, 6)}...${address.slice(-4)}`}</span>
    </div>
  );
}

export function BorrowSubPage() {
  const { chainId, address: userAddress } = useAccount();
  const { data: blockNumber } = useBlockNumber({
    watch: false,
    query: { staleTime: Infinity, gcTime: Infinity, refetchOnMount: "always" },
  });

  const morpho = useMemo(() => getContractDeploymentInfo(chainId, "Morpho"), [chainId]);

  const {
    data: createMarketEvents,
    isFetching: isFetchingCreateMarketEvents,
    fractionFetched: ffCreateMarketEvents,
  } = useContractEvents({
    abi: morphoAbi,
    address: morpho.address,
    fromBlock: morpho.fromBlock,
    toBlock: blockNumber,
    maxBlockRange: 10_000n,
    reverseChronologicalOrder: true,
    eventName: "CreateMarket",
    strict: true,
    query: { enabled: chainId !== undefined && blockNumber !== undefined },
  });

  const {
    data: supplyCollateralEvents,
    isFetching: isFetchingSupplyCollateralEvents,
    fractionFetched: ffSupplyCollateralEvents,
  } = useContractEvents({
    abi: morphoAbi,
    address: morpho.address,
    fromBlock: morpho.fromBlock,
    toBlock: blockNumber,
    maxBlockRange: 10_000n,
    reverseChronologicalOrder: true,
    eventName: "SupplyCollateral",
    args: { onBehalf: userAddress },
    strict: true,
    query: {
      enabled:
        chainId !== undefined &&
        blockNumber !== undefined &&
        userAddress !== undefined &&
        !isFetchingCreateMarketEvents, // We could fetch despite this, but we may get rate-limited.
    },
  });

  const filteredCreateMarketArgs = useMemo(
    () =>
      createMarketEvents
        .filter((createMarketEvent) => supplyCollateralEvents.some((ev) => ev.args.id === createMarketEvent.args.id))
        .map((ev) => ev.args),
    [createMarketEvents, supplyCollateralEvents],
  );

  const { data: erc20Symbols, isFetching: isFetchingErc20Symbols } = useReadContracts({
    contracts: filteredCreateMarketArgs
      .map((args) => [
        { address: args.marketParams.collateralToken, abi: erc20Abi, functionName: "symbol" } as const,
        { address: args.marketParams.loanToken, abi: erc20Abi, functionName: "symbol" } as const,
      ])
      .flat(),
    allowFailure: true,
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  const { data: erc20Decimals, isFetching: isFetchingErc20Decimals } = useReadContracts({
    contracts: filteredCreateMarketArgs
      .map((args) => [
        { address: args.marketParams.collateralToken, abi: erc20Abi, functionName: "decimals" } as const,
        { address: args.marketParams.loanToken, abi: erc20Abi, functionName: "decimals" } as const,
      ])
      .flat(),
    allowFailure: true,
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  const { data: markets, isFetching: isFetchingMarkets } = useReadContracts({
    contracts: filteredCreateMarketArgs.map(
      (args) =>
        ({
          address: morpho.address,
          abi: morphoAbi,
          functionName: "market",
          args: [args.id],
        }) as const,
    ),
    allowFailure: false,
    query: { staleTime: 10 * 60 * 1000, gcTime: Infinity, placeholderData: keepPreviousData },
  });

  const tokens = useMemo(() => {
    const map = new Map<Address, Token>();
    filteredCreateMarketArgs.forEach((args, idx) => {
      map.set(args.marketParams.collateralToken, {
        address: args.marketParams.collateralToken,
        symbol: erc20Symbols?.[idx * 2].result,
        decimals: erc20Decimals?.[idx * 2].result,
        imageSrc: blo(args.marketParams.collateralToken),
      });
      map.set(args.marketParams.loanToken, {
        address: args.marketParams.loanToken,
        symbol: erc20Symbols?.[idx * 2 + 1].result,
        decimals: erc20Decimals?.[idx * 2 + 1].result,
        imageSrc: blo(args.marketParams.loanToken),
      });
    });
    return map;
  }, [filteredCreateMarketArgs, erc20Symbols, erc20Decimals]);

  const totalProgress = isFetchingCreateMarketEvents
    ? ffCreateMarketEvents
    : isFetchingSupplyCollateralEvents
      ? 1 + ffSupplyCollateralEvents
      : isFetchingErc20Symbols
        ? 2
        : isFetchingErc20Decimals
          ? 3
          : isFetchingMarkets
            ? 4
            : 5;

  return (
    <div className="flex min-h-screen flex-col px-2.5">
      <div className="flex justify-between gap-4 px-8 pt-24 pb-10 md:px-32 md:pt-32 md:pb-18 dark:bg-neutral-900">
        <Card>
          <CardContent className="flex h-full w-[220px] flex-col gap-4 px-2 text-xs font-light sm:p-6">
            <span>Indexing Morpho Blue markets</span>
            <Progress value={ffCreateMarketEvents * 100} />
            Indexing your positions
            <Progress value={ffSupplyCollateralEvents * 100} className="mb-auto" />
            <i className="bottom-0">Total Progress</i>
            <Progress value={(totalProgress * 100) / 5} />
          </CardContent>
        </Card>
        <RequestChart />
      </div>
      <div className="bg-background dark:bg-background/70 flex grow justify-center rounded-t-xl">
        <div className="text-primary w-full max-w-7xl px-8 pt-8 pb-32 md:px-32">
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
                <Sheet key={args.id}>
                  <SheetTrigger asChild>
                    <TableRow className="bg-secondary">
                      <TableCell className="rounded-l-lg p-5">
                        <TokenTableCell {...tokens.get(args.marketParams.collateralToken)!} />
                      </TableCell>
                      <TableCell>
                        <TokenTableCell {...tokens.get(args.marketParams.loanToken)!} />
                      </TableCell>
                      <TableCell>{formatLtv(args.marketParams.lltv)}</TableCell>
                      <TableCell className="rounded-r-lg">
                        {markets && tokens.get(args.marketParams.loanToken)?.decimals !== undefined
                          ? formatBalanceWithSymbol(
                              markets[idx][0] - markets[idx][2],
                              tokens.get(args.marketParams.loanToken)!.decimals!,
                              tokens.get(args.marketParams.loanToken)?.symbol,
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
