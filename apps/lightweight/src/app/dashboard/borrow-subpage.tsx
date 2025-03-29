import { irmAbi } from "@morpho-blue-offchain-public/uikit/assets/abis/irm";
import { metaMorphoAbi } from "@morpho-blue-offchain-public/uikit/assets/abis/meta-morpho";
import { metaMorphoFactoryAbi } from "@morpho-blue-offchain-public/uikit/assets/abis/meta-morpho-factory";
import { morphoAbi } from "@morpho-blue-offchain-public/uikit/assets/abis/morpho";
import { Avatar, AvatarFallback, AvatarImage } from "@morpho-blue-offchain-public/uikit/components/shadcn/avatar";
import { Sheet, SheetTrigger } from "@morpho-blue-offchain-public/uikit/components/shadcn/sheet";
import {
  Table,
  TableBody,
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
import { readWithdrawQueue } from "@morpho-blue-offchain-public/uikit/lens/read-withdraw-queue";
import {
  formatBalanceWithSymbol,
  formatApy,
  formatLtv,
  getTokenSymbolURI,
  Token,
} from "@morpho-blue-offchain-public/uikit/lib/utils";
import { MarketId, MarketParams, MarketUtils } from "@morpho-org/blue-sdk";
import { keepPreviousData } from "@tanstack/react-query";
import { blo } from "blo";
import { Eye, Info } from "lucide-react";
import { useMemo } from "react";
import { Address, erc20Abi, isAddressEqual, Hex } from "viem";
import { useAccount, useReadContracts } from "wagmi";

import { BorrowSheetContent } from "@/components/borrow-sheet-content";
import { CtaCard } from "@/components/cta-card";
import { useTopNCurators } from "@/hooks/use-top-n-curators";
import { CORE_DEPLOYMENTS, getContractDeploymentInfo } from "@/lib/constants";

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
      <span className="text-primary/30 font-mono">{`${address.slice(0, 6)}...${address.slice(-4)}`}</span>
    </div>
  );
}

export function BorrowSubPage() {
  const { chainId, address: userAddress } = useAccount();

  const [morpho, factory, factoryV1_1] = useMemo(
    () => [
      getContractDeploymentInfo(chainId, "Morpho"),
      getContractDeploymentInfo(chainId, "MetaMorphoFactory"),
      getContractDeploymentInfo(chainId, "MetaMorphoV1_1Factory"),
    ],
    [chainId],
  );

  // MARK: Fetch `MetaMorphoFactory.CreateMetaMorpho` on all factory versions so that we have all deployments
  const {
    logs: { all: createMetaMorphoEvents },
    isFetching: isFetchingCreateMetaMorphoEvents,
  } = useContractEvents({
    chainId,
    abi: metaMorphoFactoryAbi,
    address: factoryV1_1 ? [factoryV1_1.address].concat(factory ? [factory.address] : []) : [],
    fromBlock: factory?.fromBlock ?? factoryV1_1?.fromBlock,
    reverseChronologicalOrder: true,
    eventName: "CreateMetaMorpho",
    strict: true,
    query: { enabled: chainId !== undefined },
  });

  // MARK: Fetch metadata for every MetaMorpho vault
  const { data: vaultInfos } = useReadContracts({
    contracts: createMetaMorphoEvents
      .map((ev) => [
        { address: ev.args.metaMorpho, abi: metaMorphoAbi, functionName: "owner" } as const,
        { address: ev.args.metaMorpho, abi: metaMorphoAbi, functionName: "timelock" } as const,
        { address: ev.args.metaMorpho, abi: metaMorphoAbi, functionName: "name" } as const,
        { address: ev.args.metaMorpho, abi: metaMorphoAbi, functionName: "totalAssets" } as const,
        {
          address: ev.args.metaMorpho,
          abi: metaMorphoAbi,
          functionName: "maxWithdraw",
          args: [userAddress ?? "0x"],
        } as const,
        readWithdrawQueue(ev.args.metaMorpho),
      ])
      .flat(),
    allowFailure: false,
    query: {
      refetchOnMount: "always",
      enabled: !isFetchingCreateMetaMorphoEvents && userAddress !== undefined,
    },
  });

  // MARK: Only include vaults owned by the top 5 curators from core deployments, or in which the user has deposits.
  const top5Curators = useTopNCurators({ n: 5, verifiedOnly: true, chainIds: [...CORE_DEPLOYMENTS] });
  const marketIds = useMemo(() => {
    const marketIdsSet = new Set<Hex>();

    if (vaultInfos !== undefined) {
      for (let i = 0; i < createMetaMorphoEvents.length; i += 1) {
        const owner = vaultInfos[i * 6 + 0] as Address;
        const withdrawQueue = vaultInfos[i * 6 + 5] as Hex[];

        const curator = (top5Curators ?? []).find((curator) =>
          (curator.addresses ?? []).find((v) => isAddressEqual(v.address as Address, owner)),
        );

        if (curator !== undefined) {
          withdrawQueue.forEach((market) => marketIdsSet.add(market));
        }
      }
    }

    const marketIds = Array.from(marketIdsSet);
    // Sort them so that queryKey is consistent in the `useReadContracts` hooks below
    marketIds.sort();
    return marketIds;
  }, [createMetaMorphoEvents, vaultInfos, top5Curators]);

  const { data: marketParamsRaw } = useReadContracts({
    contracts: marketIds.map(
      (marketId) =>
        ({
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

  const { data: erc20Symbols } = useReadContracts({
    contracts: filteredCreateMarketArgs
      .map((args) => [
        { address: args.marketParams.collateralToken, abi: erc20Abi, functionName: "symbol" } as const,
        { address: args.marketParams.loanToken, abi: erc20Abi, functionName: "symbol" } as const,
      ])
      .flat(),
    allowFailure: true,
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  const { data: erc20Decimals } = useReadContracts({
    contracts: filteredCreateMarketArgs
      .map((args) => [
        { address: args.marketParams.collateralToken, abi: erc20Abi, functionName: "decimals" } as const,
        { address: args.marketParams.loanToken, abi: erc20Abi, functionName: "decimals" } as const,
      ])
      .flat(),
    allowFailure: true,
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  const { data: marketsRaw } = useReadContracts({
    contracts: filteredCreateMarketArgs.map(
      (args) =>
        ({
          address: morpho?.address ?? "0x",
          abi: morphoAbi,
          functionName: "market",
          args: [args.id],
        }) as const,
    ),
    allowFailure: false,
    query: { staleTime: 10 * 60 * 1000, gcTime: Infinity, placeholderData: keepPreviousData, enabled: !!morpho },
  });

  const markets = useMemo(
    () =>
      marketsRaw?.map((market) => ({
        totalSupplyAssets: market[0],
        totalSupplyShares: market[1],
        totalBorrowAssets: market[2],
        totalBorrowShares: market[3],
        lastUpdate: market[4],
        fee: market[5],
      })),
    [marketsRaw],
  );

  const { data: apss } = useReadContracts({
    contracts: filteredCreateMarketArgs.map((args, idx) => ({
      address: args.marketParams.irm,
      abi: irmAbi,
      functionName: "borrowRateView",
      args: markets ? [args.marketParams, markets[idx]] : undefined,
    })),
    allowFailure: true,
    query: {
      staleTime: 10 * 60 * 1000,
      gcTime: Infinity,
      placeholderData: keepPreviousData,
      enabled: !!morpho && !!markets,
    },
  });

  const { data: positionsRaw, refetch: refetchPositionsRaw } = useReadContracts({
    contracts: filteredCreateMarketArgs.map(
      (args) =>
        ({
          address: morpho?.address ?? "0x",
          abi: morphoAbi,
          functionName: "position",
          args: userAddress ? [args.id, userAddress] : undefined,
        }) as const,
    ),
    allowFailure: false,
    query: { staleTime: 1 * 60 * 1000, gcTime: Infinity, placeholderData: keepPreviousData, enabled: !!morpho },
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
      ) : (
        <div className="flex h-96 w-full max-w-5xl flex-col gap-4 px-8 pb-14 pt-24 md:m-auto md:px-0 md:pt-32 dark:bg-neutral-900"></div>
      )}
      <div className="bg-background dark:bg-background/30 flex grow justify-center rounded-t-xl">
        <div className="text-primary w-full max-w-5xl px-8 pb-32 pt-8">
          <Table className="border-separate border-spacing-y-3">
            <TableHeader className="bg-secondary">
              <TableRow>
                <TableHead className="text-primary rounded-l-lg pl-4 text-xs font-light">Collateral</TableHead>
                <TableHead className="text-primary text-xs font-light">Loan</TableHead>
                <TableHead className="text-primary text-xs font-light">LLTV</TableHead>
                <TableHead className="text-primary text-xs font-light">Position</TableHead>
                <TableHead className="text-primary text-xs font-light">
                  <div className="flex items-center gap-1">
                    Liquidity
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-4 w-4" />
                        </TooltipTrigger>
                        <TooltipContent className="text-primary max-w-56 rounded-3xl p-4 font-mono shadow-2xl">
                          This value will be smaller than that of the full app. It doesn't include shared market
                          liquidity which could be reallocated upon borrow.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </TableHead>
                <TableHead className="text-primary rounded-r-lg text-xs font-light">Rate</TableHead>
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
                              <TooltipContent className="text-primary max-w-56 rounded-3xl p-4 font-mono shadow-2xl">
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
                                          totalBorrowAssets: markets[idx].totalBorrowAssets,
                                          totalBorrowShares: markets[idx].totalBorrowShares,
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
                      <TableCell>
                        {markets && tokens.get(args.marketParams.loanToken)?.decimals !== undefined
                          ? formatBalanceWithSymbol(
                              markets[idx].totalSupplyAssets - markets[idx].totalBorrowAssets,
                              tokens.get(args.marketParams.loanToken)!.decimals!,
                              tokens.get(args.marketParams.loanToken)!.symbol,
                              5,
                              true,
                            )
                          : "－"}
                      </TableCell>
                      <TableCell className="rounded-r-lg">
                        {apss?.[idx].status === "success"
                          ? `${formatApy(MarketUtils.compoundRate(apss[idx].result))}`
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
                            ...markets[idx],
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
