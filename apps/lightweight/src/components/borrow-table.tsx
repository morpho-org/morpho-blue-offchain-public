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
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@morpho-blue-offchain-public/uikit/components/shadcn/tooltip";
import {
  formatLtv,
  formatBalanceWithSymbol,
  formatApy,
  Token,
  abbreviateAddress,
} from "@morpho-blue-offchain-public/uikit/lib/utils";
import { AccrualPosition, Market } from "@morpho-org/blue-sdk";
import { blo } from "blo";
import { ExternalLink, Info } from "lucide-react";
import { Chain, Hex, type Address } from "viem";

import { BorrowSheetContent } from "@/components/borrow-sheet-content";
import { SHARED_LIQUIDITY_DOCUMENTATION } from "@/lib/constants";

function TokenTableCell({ address, symbol, imageSrc, chain }: Token & { chain: Chain | undefined }) {
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
          <div className="flex items-center gap-1">
            <p>
              Address: <code>{abbreviateAddress(address)}</code>
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

function HealthTableCell({
  market,
  position,
  collateralToken,
  loanToken,
}: {
  market: Market;
  position?: AccrualPosition;
  collateralToken: Token;
  loanToken: Token;
}) {
  const ltvText = typeof position?.accrueInterest().ltv === "bigint" ? formatLtv(position.accrueInterest().ltv!) : "－";
  const lltvText = formatLtv(market.params.lltv);
  const lPriceText =
    typeof position?.liquidationPrice === "bigint"
      ? formatBalanceWithSymbol(position.liquidationPrice, 36, "", 5)
      : "－";
  const priceDropText =
    typeof position?.priceVariationToLiquidationPrice === "bigint"
      ? formatLtv(position.priceVariationToLiquidationPrice)
      : "－";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="hover:bg-tertiary/15 ml-[-8px] flex w-min items-center gap-2 rounded-sm p-2">
            {ltvText} / {lltvText}
          </div>
        </TooltipTrigger>
        <TooltipContent className="text-primary rounded-3xl p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex w-[240px] flex-col gap-3">
            <div className="flex justify-between">
              LTV / Liq. LTV
              <span>
                {ltvText} / {lltvText}
              </span>
            </div>
            <div className="flex justify-between">
              Liq. Price {`(${collateralToken.symbol} / ${loanToken.symbol})`}
              <span>{lPriceText}</span>
            </div>
            <div className="flex justify-between">
              Price Drop To Liq.
              <span>{priceDropText}</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function BorrowTable({
  chain,
  markets,
  tokens,
  refetchPositions,
}: {
  chain: Chain | undefined;
  markets: Market[];
  tokens: Map<Address, Token>;
  refetchPositions: () => void;
}) {
  return (
    <Table className="border-separate border-spacing-y-3">
      <TableHeader className="bg-secondary">
        <TableRow>
          <TableHead className="text-primary rounded-l-lg pl-4 text-xs font-light">Collateral</TableHead>
          <TableHead className="text-primary text-xs font-light">Loan</TableHead>
          <TableHead className="text-primary text-xs font-light">LLTV</TableHead>
          <TableHead className="text-primary text-xs font-light">
            <div className="flex items-center gap-1">
              Liquidity
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4" />
                  </TooltipTrigger>
                  <TooltipContent className="text-primary max-w-56 rounded-3xl p-4 text-xs shadow-2xl">
                    This value will be smaller than that of the full app. It doesn't include{" "}
                    <a
                      className="underline"
                      href={SHARED_LIQUIDITY_DOCUMENTATION}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      shared liquidity
                    </a>{" "}
                    which could be reallocated to this market after you borrow.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </TableHead>
          <TableHead className="text-primary rounded-r-lg text-xs font-light">Rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {markets.map((market) => (
          <Sheet
            key={market.id}
            onOpenChange={(isOpen) => {
              // Refetch positions on sidesheet close, since user may have sent txns to modify one
              if (!isOpen) void refetchPositions();
            }}
          >
            <SheetTrigger asChild>
              <TableRow className="bg-secondary hover:bg-accent">
                <TableCell className="rounded-l-lg py-3">
                  <TokenTableCell {...tokens.get(market.params.collateralToken)!} chain={chain} />
                </TableCell>
                <TableCell>
                  <TokenTableCell {...tokens.get(market.params.loanToken)!} chain={chain} />
                </TableCell>
                <TableCell>{formatLtv(market.params.lltv)}</TableCell>
                <TableCell>
                  {markets && tokens.get(market.params.loanToken)?.decimals !== undefined
                    ? formatBalanceWithSymbol(
                        market.liquidity,
                        tokens.get(market.params.loanToken)!.decimals!,
                        tokens.get(market.params.loanToken)!.symbol,
                        5,
                        true,
                      )
                    : "－"}
                </TableCell>
                <TableCell className="rounded-r-lg">
                  {market.borrowApy ? `${formatApy(market.borrowApy)}` : "－"}
                </TableCell>
              </TableRow>
            </SheetTrigger>
            <BorrowSheetContent marketId={market.id} marketParams={market.params} imarket={market} tokens={tokens} />
          </Sheet>
        ))}
      </TableBody>
    </Table>
  );
}

export function BorrowPositionTable({
  chain,
  markets,
  tokens,
  positions,
  refetchPositions,
}: {
  chain: Chain | undefined;
  markets: Market[];
  tokens: Map<Address, Token>;
  positions: Map<Hex, AccrualPosition> | undefined;
  refetchPositions: () => void;
}) {
  return (
    <Table className="border-separate border-spacing-y-3">
      <TableHeader className="bg-secondary">
        <TableRow>
          <TableHead className="text-primary rounded-l-lg pl-4 text-xs font-light">Collateral</TableHead>
          <TableHead className="text-primary text-xs font-light">Loan</TableHead>
          <TableHead className="text-primary text-xs font-light">Rate</TableHead>
          <TableHead className="text-primary rounded-r-lg text-xs font-light">Health</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {markets.map((market) => {
          const collateralToken = tokens.get(market.params.collateralToken)!;
          const loanToken = tokens.get(market.params.loanToken)!;
          const position = positions?.get(market.id);

          let collateralText = collateralToken.symbol;
          if (position && collateralToken.decimals !== undefined) {
            collateralText = formatBalanceWithSymbol(
              position.collateral,
              collateralToken.decimals,
              collateralToken.symbol,
              5,
            );
          }
          let loanText = loanToken.symbol;
          if (position && loanToken.decimals !== undefined) {
            loanText = formatBalanceWithSymbol(position.borrowAssets, loanToken.decimals, loanToken.symbol, 5);
          }

          return (
            <Sheet
              key={market.id}
              onOpenChange={(isOpen) => {
                // Refetch positions on sidesheet close, since user may have sent txns to modify one
                if (!isOpen) void refetchPositions();
              }}
            >
              <SheetTrigger asChild>
                <TableRow className="bg-secondary hover:bg-accent">
                  <TableCell className="rounded-l-lg py-3">
                    <TokenTableCell {...collateralToken} symbol={collateralText} chain={chain} />
                  </TableCell>
                  <TableCell>
                    <TokenTableCell {...loanToken} symbol={loanText} chain={chain} />
                  </TableCell>
                  <TableCell>{market.borrowApy ? `${formatApy(market.borrowApy)}` : "－"}</TableCell>
                  <TableCell className="rounded-r-lg">
                    <HealthTableCell
                      market={market}
                      position={position}
                      loanToken={loanToken}
                      collateralToken={collateralToken}
                    />
                  </TableCell>
                </TableRow>
              </SheetTrigger>
              <BorrowSheetContent marketId={market.id} marketParams={market.params} imarket={market} tokens={tokens} />
            </Sheet>
          );
        })}
      </TableBody>
    </Table>
  );
}
