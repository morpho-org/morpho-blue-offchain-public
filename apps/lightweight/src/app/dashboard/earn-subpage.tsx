import { metaMorphoAbi } from "@morpho-blue-offchain-public/uikit/assets/abis/meta-morpho";
import { metaMorphoFactoryAbi } from "@morpho-blue-offchain-public/uikit/assets/abis/meta-morpho-factory";
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
import { formatBalanceWithSymbol, getTokenSymbolURI, Token } from "@morpho-blue-offchain-public/uikit/lib/utils";
import { blo } from "blo";
// @ts-expect-error: this package lacks types
import humanizeDuration from "humanize-duration";
import { useMemo } from "react";
import { Address, erc20Abi, isAddressEqual } from "viem";
import { useAccount, useReadContracts } from "wagmi";

import { CtaCard } from "@/components/cta-card";
import { EarnSheetContent } from "@/components/earn-sheet-content";
import { useTopNCurators } from "@/hooks/use-top-n-curators";
import { CORE_DEPLOYMENTS, getContractDeploymentInfo } from "@/lib/constants";

type Vault = {
  address: `0x${string}`;
  imageSrc: string;
  info:
    | {
        owner: Address;
        timelock: bigint;
        name: string;
        totalAssets: bigint;
        maxWithdraw: bigint;
      }
    | undefined;
  asset: Token;
  curator?: {
    address: Address;
    name: string;
    url: string | null;
    imageSrc: string | null;
  };
};

function VaultTableCell({ address, symbol, imageSrc }: Token) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="hover:bg-tertiary/15 flex w-min items-center gap-2 rounded-sm p-2">
            <Avatar className="h-4 w-4 rounded-sm">
              <AvatarImage src={imageSrc} alt="Avatar" />
              <AvatarFallback delayMs={500}>
                <img src={blo(address)} />
              </AvatarFallback>
            </Avatar>
            {symbol ?? "－"}
          </div>
        </TooltipTrigger>
        <TooltipContent className="text-primary rounded-3xl p-4 font-mono shadow-2xl">{`${address.slice(0, 6)}...${address.slice(-4)}`}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function CuratorTableCell({ address, symbol, imageSrc }: Token) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="hover:bg-tertiary/15 ml-[-8px] flex w-min items-center gap-2 rounded-sm p-2">
            <Avatar className="h-4 w-4 rounded-sm">
              <AvatarImage src={imageSrc} alt="Avatar" />
              <AvatarFallback delayMs={500}>
                <img src={blo(address)} />
              </AvatarFallback>
            </Avatar>
            {symbol ?? "－"}
          </div>
        </TooltipTrigger>
        <TooltipContent className="text-primary rounded-3xl p-4 font-mono shadow-2xl">{`${address.slice(0, 6)}...${address.slice(-4)}`}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function VaultTable({ vaults, depositsMode }: { vaults: Vault[]; depositsMode: "totalAssets" | "maxWithdraw" }) {
  return (
    <div className="text-primary w-full max-w-5xl px-8 pt-8">
      <Table className="border-separate border-spacing-y-3">
        <TableHeader className="bg-secondary">
          <TableRow>
            <TableHead className="text-primary rounded-l-lg pl-4 text-xs font-light">Vault</TableHead>
            <TableHead className="text-primary text-nowrap text-xs font-light">Deposits</TableHead>
            <TableHead className="text-primary text-xs font-light">Curator</TableHead>
            <TableHead className="text-primary rounded-r-lg text-xs font-light">Timelock</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vaults.map((vault) => {
            const ownerText = vault.info?.owner
              ? `${vault.info.owner.slice(0, 6)}...${vault.info.owner.slice(-4)}`
              : "－";
            return (
              <Sheet key={vault.address}>
                <SheetTrigger asChild>
                  <TableRow className="bg-secondary hover:bg-accent">
                    <TableCell className="rounded-l-lg py-3">
                      <VaultTableCell address={vault.address} symbol={vault.info?.name} imageSrc={vault.imageSrc} />
                    </TableCell>
                    <TableCell>
                      {vault.info?.[depositsMode] && vault.asset.decimals
                        ? formatBalanceWithSymbol(
                            vault.info[depositsMode],
                            vault.asset.decimals,
                            vault.asset.symbol,
                            5,
                            true,
                          )
                        : "－"}
                    </TableCell>
                    <TableCell>
                      {vault.curator ? (
                        <CuratorTableCell
                          address={vault.curator.address}
                          symbol={vault.curator.name}
                          imageSrc={vault.curator.imageSrc ?? ""}
                        />
                      ) : (
                        ownerText
                      )}
                    </TableCell>
                    <TableCell className="rounded-r-lg">
                      {vault.info ? humanizeDuration(Number(vault.info.timelock) * 1000) : "－"}
                    </TableCell>
                  </TableRow>
                </SheetTrigger>
                <EarnSheetContent vaultAddress={vault.address} asset={vault.asset} />
              </Sheet>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function EarnSubPage() {
  const { chainId, address: userAddress } = useAccount();

  const [factory, factoryV1_1] = useMemo(
    () => [
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
  const [filteredCreateMetaMorphoArgs, filteredVaultInfos, vaultCurators, assets] = useMemo(() => {
    const args: (typeof createMetaMorphoEvents)[number]["args"][] = [];
    const infos: NonNullable<typeof vaultInfos> = [];
    const curators: (NonNullable<typeof top5Curators>[number] | undefined)[] = [];

    if (vaultInfos !== undefined) {
      for (let i = 0; i < createMetaMorphoEvents.length; i += 1) {
        const owner = vaultInfos[i * 6 + 0] as Address;
        const maxWithdraw = vaultInfos[i * 6 + 4] as bigint;

        const curator = (top5Curators ?? []).find((curator) =>
          (curator.addresses ?? []).find((v) => isAddressEqual(v.address as Address, owner)),
        );

        if (curator !== undefined || maxWithdraw > 0n) {
          args.push(createMetaMorphoEvents[i].args);
          infos.push(...vaultInfos.slice(i * 6, (i + 1) * 6));
          curators.push(curator);
        }
      }
    }

    const assets = Array.from(new Set(args.map((x) => x.asset)));
    return [args, infos, curators, assets];
  }, [createMetaMorphoEvents, vaultInfos, top5Curators]);

  // MARK: Fetch metadata for every ERC20 asset
  const { data: assetsInfo } = useReadContracts({
    contracts: assets
      .map((asset) => [
        { address: asset, abi: erc20Abi, functionName: "symbol" } as const,
        { address: asset, abi: erc20Abi, functionName: "decimals" } as const,
      ])
      .flat(),
    allowFailure: true,
    query: { staleTime: Infinity, gcTime: Infinity },
  });

  const vaults = useMemo(() => {
    const arr = filteredCreateMetaMorphoArgs.map((args, idx) => {
      const assetIdx = assets.indexOf(args.asset);
      const symbol = assetIdx > -1 ? (assetsInfo?.[assetIdx * 2 + 0].result as string) : undefined;
      const decimals = assetIdx > -1 ? (assetsInfo?.[assetIdx * 2 + 1].result as number) : undefined;
      return {
        address: args.metaMorpho,
        imageSrc: getTokenSymbolURI(symbol),
        info: filteredVaultInfos
          ? {
              owner: filteredVaultInfos[idx * 6 + 0] as Address,
              timelock: filteredVaultInfos[idx * 6 + 1] as bigint,
              name: filteredVaultInfos[idx * 6 + 2] as string,
              totalAssets: filteredVaultInfos[idx * 6 + 3] as bigint,
              maxWithdraw: filteredVaultInfos[idx * 6 + 4] as bigint,
            }
          : undefined,
        asset: {
          address: args.asset,
          imageSrc: getTokenSymbolURI(symbol),
          symbol,
          decimals,
        } as Token,
        curator: vaultCurators[idx]
          ? {
              address: filteredVaultInfos[idx * 6 + 0] as Address,
              name: vaultCurators[idx].name,
              url: vaultCurators[idx].url,
              imageSrc: vaultCurators[idx].image,
            }
          : undefined,
      };
    });
    // Sort vaults so that ones with an open balance appear first
    arr.sort((a, b) => {
      if (!a.info?.maxWithdraw && !b.info?.maxWithdraw) return 0;
      if (!a.info?.maxWithdraw) return 1;
      if (!b.info?.maxWithdraw) return -1;
      return 0;
    });
    // Filter out unnamed vaults and vaults with 0 deposits
    return arr.filter((vault) => vault.info?.name !== "" && !!vault.info?.totalAssets);
  }, [filteredCreateMetaMorphoArgs, filteredVaultInfos, assets, assetsInfo, vaultCurators]);

  return (
    <div className="flex min-h-screen flex-col px-2.5">
      {userAddress === undefined ? (
        <CtaCard
          className="flex w-full max-w-5xl flex-col gap-4 px-8 pb-14 pt-24 md:m-auto md:grid md:grid-cols-[50%_50%] md:px-0 md:pt-32 dark:bg-neutral-900"
          bigText="Earn on your terms"
          littleText="Connect wallet to get started"
          videoSrc={{
            mov: "https://cdn.morpho.org/v2/assets/videos/earn-animation.mov",
            webm: "https://cdn.morpho.org/v2/assets/videos/earn-animation.webm",
          }}
        />
      ) : (
        <div className="flex h-fit min-h-96 w-full max-w-5xl flex-col gap-4 px-8 pb-14 pt-24 md:m-auto md:px-0 md:pt-32 dark:bg-neutral-900">
          <VaultTable vaults={vaults.filter((v) => !!v.info?.maxWithdraw)} depositsMode="maxWithdraw" />
        </div>
      )}
      <div className="bg-background dark:bg-background/30 flex grow justify-center rounded-t-xl pb-32">
        <VaultTable vaults={vaults} depositsMode="totalAssets" />
      </div>
    </div>
  );
}
