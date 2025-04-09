import { AvatarStack } from "@morpho-blue-offchain-public/uikit/components/avatar-stack";
import { AvatarImage, AvatarFallback, Avatar } from "@morpho-blue-offchain-public/uikit/components/shadcn/avatar";
import { Sheet, SheetTrigger } from "@morpho-blue-offchain-public/uikit/components/shadcn/sheet";
import {
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
  Table,
} from "@morpho-blue-offchain-public/uikit/components/shadcn/table";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@morpho-blue-offchain-public/uikit/components/shadcn/tooltip";
import {
  formatBalanceWithSymbol,
  formatApy,
  Token,
  getTokenSymbolURI,
  formatLtv,
  abbreviateAddress,
} from "@morpho-blue-offchain-public/uikit/lib/utils";
import { AccrualVault } from "@morpho-org/blue-sdk";
import { blo } from "blo";
// @ts-expect-error: this package lacks types
import humanizeDuration from "humanize-duration";
import { DollarSign, ExternalLink, SignalHigh } from "lucide-react";
import { Chain, hashMessage, Address, zeroAddress } from "viem";

import { EarnSheetContent } from "@/components/earn-sheet-content";

export type Row = {
  vault: AccrualVault;
  asset: Token;
  curators: {
    [name: string]: {
      name: string;
      roles: { name: string; address: Address }[];
      url: string | null;
      imageSrc: string | null;
    };
  };
  maxWithdraw: bigint | undefined;
  imageSrc: string;
};

function VaultTableCell({
  address,
  symbol,
  imageSrc,
  chain,
  timelock,
}: Token & { chain: Chain | undefined; timelock: bigint }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="hover:bg-tertiary/15 flex w-min items-center gap-2 rounded-sm p-2">
            <Avatar className="h-4 w-4 rounded-sm">
              <AvatarImage src={imageSrc} alt="Avatar" />
              <AvatarFallback delayMs={1000}>
                <img src={blo(address)} />
              </AvatarFallback>
            </Avatar>
            {symbol ?? "－"}
          </div>
        </TooltipTrigger>
        <TooltipContent className="text-primary rounded-3xl p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <p className="underline">Properties</p>
          <p>Timelock: {humanizeDuration(Number(timelock) * 1000)}</p>
          <br />
          <div className="flex items-center gap-1">
            <p>
              Vault: <code>{abbreviateAddress(address)}</code>
            </p>
            {chain?.blockExplorers?.default.url && (
              <a
                href={`${chain.blockExplorers.default.url}/address/${address}`}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function CuratorTableCell({
  name,
  roles,
  url,
  imageSrc,
  chain,
}: Row["curators"][string] & { chain: Chain | undefined }) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <div className="hover:bg-tertiary/15 ml-[-8px] flex w-min items-center gap-2 rounded-sm p-2">
            <Avatar className="h-4 w-4 rounded-sm">
              <AvatarImage src={imageSrc ?? ""} alt="Avatar" />
              <AvatarFallback delayMs={500}>
                <img src={blo(hashMessage(name).padEnd(42, "0").slice(0, 42) as Address)} />
              </AvatarFallback>
            </Avatar>
            {name}
          </div>
        </TooltipTrigger>
        <TooltipContent className="text-primary rounded-3xl p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <p className="underline">Roles</p>
          {roles.map((role) => (
            <div className="flex items-center gap-1" key={role.name}>
              <p>
                {role.name}: <code>{abbreviateAddress(role.address)}</code>
              </p>
              {chain?.blockExplorers?.default.url && (
                <a
                  href={`${chain.blockExplorers.default.url}/address/${role.address}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          ))}
          <br />
          {url != null && (
            <a className="text-blue-200 underline" href={url} rel="noopener noreferrer" target="_blank">
              {url}
            </a>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ApyTableCell({ vault }: Pick<Row, "vault">) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="hover:bg-tertiary/15 ml-[-8px] flex w-min items-center gap-2 rounded-sm p-2">
            {formatApy(vault.netApy)}
          </div>
        </TooltipTrigger>
        <TooltipContent className="text-primary rounded-3xl p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex w-[240px] flex-col gap-3">
            <div className="flex justify-between">
              <div className="flex items-end font-light">
                <SignalHigh size={18} />
                Native APY
              </div>
              {formatApy(vault.apy)}
            </div>
            <div className="flex justify-between">
              <div className="flex items-end font-light">
                <DollarSign size={18} />
                Performance Fee
                <div className="bg-foreground/25 mx-1 rounded-sm px-0.5">{formatApy(vault.fee)}</div>
              </div>
              {formatApy((vault.fee * vault.apy) / 1_000_000_000_000_000_000n)}
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function CollateralsTableCell({
  vault,
  chain,
  tokens,
}: Pick<Row, "vault"> & { chain: Chain | undefined; tokens: Map<Address, { symbol?: string }> }) {
  const allocations = [...vault.collateralAllocations.entries()].filter(([collateral]) => collateral !== zeroAddress);
  // Sort allocations largest to smallest
  allocations.sort((a, b) => (a[1].proportion > b[1].proportion ? -1 : 1));
  return (
    <AvatarStack
      items={allocations.map(([collateral, allocation]) => {
        const token = tokens.get(collateral);
        const logoUrl = [getTokenSymbolURI(token?.symbol), blo(collateral)];
        const lltvs = [...allocation.lltvs.values()];
        const oracles = [...allocation.oracles];

        // Sort LLTVs smallest to largest
        lltvs.sort((a, b) => (a > b ? 1 : -1));

        const hoverCardContent = (
          <TooltipContent className="text-primary rounded-3xl p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex w-[240px] flex-col gap-3">
              <div className="flex justify-between font-light">
                Collateral
                <div className="flex items-end gap-1">
                  <Avatar className="h-4 w-4 rounded-full">
                    <AvatarImage src={logoUrl[0]} alt="Avatar" />
                    <AvatarFallback delayMs={500}>
                      <img src={logoUrl[1]} />
                    </AvatarFallback>
                  </Avatar>
                  {token?.symbol ?? ""}
                </div>
              </div>
              <div className="flex justify-between font-light">
                <span>LLTV</span>
                {lltvs.map((lltv) => formatLtv(lltv)).join(", ")}
              </div>
              <div className="flex justify-between font-light">
                <span>Allocation</span>
                {formatLtv(allocation.proportion)}
              </div>
              <div className="flex justify-between font-light">
                <span>Oracle</span>
                <div className="flex flex-col font-mono">
                  {oracles.map((oracle) => (
                    <a
                      className="flex gap-1"
                      href={chain?.blockExplorers?.default.url.concat(`/address/${oracle}`)}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {abbreviateAddress(oracle)}
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </TooltipContent>
        );

        return { logoUrl, hoverCardContent };
      })}
      align="left"
      maxItems={5}
    />
  );
}

export function EarnTable({
  chain,
  rows,
  depositsMode,
  tokens,
  refetchPositions,
}: {
  chain: Chain | undefined;
  rows: Row[];
  depositsMode: "totalAssets" | "maxWithdraw";
  tokens: Map<Address, { decimals?: number; symbol?: string }>;
  refetchPositions: () => void;
}) {
  return (
    <div className="text-primary w-full max-w-5xl px-8 pt-8">
      <Table className="border-separate border-spacing-y-3">
        <TableHeader className="bg-secondary">
          <TableRow>
            <TableHead className="text-primary rounded-l-lg pl-4 text-xs font-light">Vault</TableHead>
            <TableHead className="text-primary text-xs font-light">Deposits</TableHead>
            <TableHead className="text-primary text-xs font-light">Curator</TableHead>
            <TableHead className="text-primary text-xs font-light">Collateral</TableHead>
            <TableHead className="text-primary rounded-r-lg text-xs font-light">APY</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const ownerText = abbreviateAddress(row.vault.owner);
            const deposits = depositsMode === "maxWithdraw" ? row.maxWithdraw : row.vault.totalAssets;
            return (
              <Sheet
                key={row.vault.address}
                onOpenChange={(isOpen) => {
                  // Refetch positions on sidesheet close, since user may have sent txns to modify one
                  if (!isOpen) void refetchPositions();
                }}
              >
                <SheetTrigger asChild>
                  <TableRow className="bg-secondary hover:bg-accent">
                    <TableCell className="rounded-l-lg py-3">
                      <VaultTableCell
                        address={row.vault.address}
                        symbol={row.vault.name}
                        imageSrc={row.imageSrc}
                        chain={chain}
                        timelock={row.vault.timelock}
                      />
                    </TableCell>
                    <TableCell>
                      {deposits !== undefined && row.asset.decimals !== undefined
                        ? formatBalanceWithSymbol(deposits, row.asset.decimals, row.asset.symbol, 5, true)
                        : "－"}
                    </TableCell>
                    <TableCell>
                      <div className="flex w-min gap-2">
                        {Object.keys(row.curators).length > 0
                          ? Object.values(row.curators).map((curator) => (
                              <CuratorTableCell key={curator.name} {...curator} chain={chain} />
                            ))
                          : ownerText}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-[120px]">
                      <CollateralsTableCell vault={row.vault} chain={chain} tokens={tokens} />
                    </TableCell>
                    <TableCell className="rounded-r-lg">
                      <ApyTableCell vault={row.vault} />
                    </TableCell>
                  </TableRow>
                </SheetTrigger>
                <EarnSheetContent vaultAddress={row.vault.address} asset={row.asset} />
              </Sheet>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
