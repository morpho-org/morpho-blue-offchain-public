import {
  createConfig,
  deserialize,
  fallback,
  http,
  injected,
  serialize,
  type Transport,
  unstable_connector,
  WagmiProvider,
} from "wagmi";
import {
  arbitrum,
  base,
  corn,
  fraxtal,
  hemi,
  ink,
  mainnet,
  mode as modeMainnet,
  optimism,
  polygon,
  scroll as scrollMainnet,
  sonic,
  worldchain,
} from "viem/chains";
import { unichain } from "viem/op-stack";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import DashboardPage from "./app/dashboard/page";
import type { Chain, HttpTransportConfig } from "viem";
import { RequestTrackingProvider } from "./hooks/use-request-tracking";

const httpConfig: HttpTransportConfig = {
  retryDelay: 500,
  timeout: 60_000,
  batch: { batchSize: 10 },
};

function createFallbackTransport(rpcUrls: string[]) {
  return fallback([
    unstable_connector(injected, { key: "injected", name: "Injected", retryCount: 2, retryDelay: 100 }),
    ...rpcUrls.map((rpcUrl) => http(rpcUrl, httpConfig)),
    http(undefined, httpConfig),
  ]);
}

const chains = [
  mainnet,
  base,
  ink,
  optimism,
  arbitrum,
  polygon,
  unichain as Chain,
  worldchain,
  scrollMainnet,
  fraxtal,
  sonic,
  corn,
  modeMainnet,
  hemi,
] as const;

const transports: Record<(typeof chains)[number]["id"], Transport> = {
  [mainnet.id]: createFallbackTransport(["https://rpc.mevblocker.io", "https://rpc.ankr.com/eth"]),
  [base.id]: createFallbackTransport([
    "https://mainnet.base.org",
    "https://base.lava.build",
    "https://base.gateway.tenderly.co",
  ]),
  [ink.id]: createFallbackTransport(["https://ink.drpc.org"]),
  [optimism.id]: createFallbackTransport(["https://optimism.lava.build", "https://op-pokt.nodies.app"]),
  [arbitrum.id]: createFallbackTransport(["https://arbitrum.drpc.org"]),
  [polygon.id]: createFallbackTransport(["https://polygon.drpc.org"]),
  [unichain.id]: createFallbackTransport(["https://unichain.drpc.org"]),
  [worldchain.id]: createFallbackTransport(["https://worldchain.drpc.org"]),
  [scrollMainnet.id]: createFallbackTransport(["https://scroll.drpc.org"]),
  [fraxtal.id]: createFallbackTransport(["https://fraxtal.drpc.org"]),
  [sonic.id]: createFallbackTransport(["https://sonic.drpc.org"]),
  [corn.id]: createFallbackTransport(["https://mainnet.corn-rpc.com", "https://maizenet-rpc.usecorn.com"]),
  [modeMainnet.id]: createFallbackTransport(["https://mode.drpc.org"]),
  [hemi.id]: createFallbackTransport(["https://rpc.hemi.network/rpc"]),
};

const wagmiConfig = createConfig({
  chains,
  transports,
  connectors: [injected({ shimDisconnect: true })],
  batch: {
    multicall: {
      batchSize: 2048,
      wait: 500,
    },
  },
  cacheTime: 4000,
  pollingInterval: 4000,
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 7 * 24 * 60 * 60 * 1_000, // 7 days
    },
  },
});

const persister = createSyncStoragePersister({
  serialize,
  storage: window.localStorage,
  deserialize,
});

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
        <RequestTrackingProvider>
          <DashboardPage />
        </RequestTrackingProvider>
      </PersistQueryClientProvider>
    </WagmiProvider>
  );
}

export default App;

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
