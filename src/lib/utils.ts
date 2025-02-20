import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Address, formatUnits } from "viem";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBalance(balance: bigint, decimals: number) {
  const balanceNumber = Number(formatUnits(balance, decimals));

  const suffixes = ["", "k", "M", "B", "T", "P", "E"]; // Supports up to Exa (1e18)
  const magnitude = balanceNumber === 0 ? 0 : Math.floor(Math.log10(Math.abs(balanceNumber)) / 3);

  if (magnitude >= suffixes.length || magnitude < -3) return balanceNumber.toExponential(5); // Use scientific notation for very large numbers
  if (magnitude < 0) return balanceNumber.toPrecision(5);

  const scaled = balanceNumber / Math.pow(10, magnitude * 3);
  return scaled.toPrecision(5) + suffixes[magnitude];
}

export function formatBalanceWithSymbol(balance: bigint, decimals: number, symbol?: string) {
  const balanceStr = formatBalance(balance, decimals);
  if (symbol) return `${balanceStr} ${symbol}`;
  return balanceStr;
}

export function formatLtv(ltv: bigint) {
  return `${(Number(ltv / 1_000_000_000n) / 1e7).toFixed(2)}%`;
}

export type Token = { address: Address; symbol?: string; decimals?: number; imageSrc: string };
