import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Address, Chain, formatUnits } from "viem";

export function getChainSlug(chain: Pick<Chain, "name">) {
  return chain.name.toLowerCase().replace(" ", "-");
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function tryFormatBalance(
  balance: bigint | undefined,
  decimals: number | undefined,
  maxSigDigits: number | "exact" = "exact",
  enableSuffixes = false,
) {
  return balance === undefined || decimals === undefined
    ? undefined
    : formatBalance(balance, decimals, maxSigDigits, enableSuffixes);
}

export function formatBalance(
  balance: bigint,
  decimals: number,
  maxSigDigits: number | "exact" = "exact",
  enableSuffixes = false,
) {
  const numDigits = balance.toString(10).length - 1;
  if (maxSigDigits !== "exact" && numDigits + 1 > maxSigDigits) {
    const resolution = 10n ** BigInt(numDigits + 1 - maxSigDigits);
    balance = (balance / resolution) * resolution;
  }

  const suffixes = ["", "k", "M", "B", "T"];
  let suffixIdx = 0;
  if (enableSuffixes) {
    const orderOfMagnitude = Math.max(0, numDigits - decimals);
    suffixIdx = Math.min(Math.floor(orderOfMagnitude / 3), suffixes.length - 1);
    decimals += suffixIdx * 3;
  }
  return formatUnits(balance, decimals).concat(suffixes[suffixIdx]);
}

export function formatBalanceWithSymbol(
  balance: bigint,
  decimals: number,
  symbol?: string,
  maxSigDigs: number | "exact" = "exact",
  enableSuffixes = false,
) {
  const balanceStr = formatBalance(balance, decimals, maxSigDigs, enableSuffixes);
  if (symbol) return `${balanceStr} ${symbol}`;
  return balanceStr;
}

export function formatLtv(ltv: bigint) {
  return `${(Number(ltv / 1_000_000_000n) / 1e7).toFixed(2)}%`;
}

export function formatApy(apy: bigint) {
  return `${(Number(apy / 1_000_000_000n) / 1e7).toFixed(2)}%`;
}

export function abbreviateAddress(address: Address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export type Token = { address: Address; symbol?: string; decimals?: number; imageSrc: string };

/**
 * Generate a url for a token's svg leveraging the Morpho CDN.
 */
export function getTokenSymbolURI(symbol: string | undefined) {
  return `https://cdn.morpho.org/assets/logos/${encodeURIComponent((symbol ?? "").toLowerCase())}.svg`;
}

export function promiseWithTimeout<T>(
  promise: Promise<T>,
  ms: number,
  error = new Error("Promise timed out"),
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(error), ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function areSetsEqual<T>(a: Set<T>, b: Set<T>) {
  if (a.size !== b.size) return false;

  for (const key of a) {
    if (!b.has(key)) return false;
  }
  return true;
}

export function compareBigInts(a: bigint, b: bigint) {
  if (a == b) return 0;
  return a > b ? 1 : -1;
}

export function max(a: bigint, b: bigint) {
  return a > b ? a : b;
}

export function min(a: bigint, b: bigint) {
  return a < b ? a : b;
}
