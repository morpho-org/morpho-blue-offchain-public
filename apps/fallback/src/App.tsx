import { AddressScreeningModal } from "@morpho-org/uikit/components/address-screening-modal";
import { AddressScreeningProvider } from "@morpho-org/uikit/hooks/use-address-screening";
import { RequestTrackingProvider } from "@morpho-org/uikit/hooks/use-request-tracking";
import { cyrb64Hash } from "@morpho-org/uikit/lib/cyrb64";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ReactNode } from "react";
import { type Config, deserialize, serialize, WagmiProvider } from "wagmi";

import { createConfig } from "@/lib/wagmi-config";

const defaultWagmiConfig = createConfig({});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 7 * 24 * 60 * 60 * 1_000, // 7 days
      queryKeyHashFn(queryKey) {
        return cyrb64Hash(serialize(queryKey));
      },
    },
  },
});

const persister = createSyncStoragePersister({
  serialize,
  storage: window.localStorage,
  deserialize,
});

function App({ children, wagmiConfig = defaultWagmiConfig }: { children: ReactNode; wagmiConfig?: Config }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, buster: "v1" }}>
        <RequestTrackingProvider>
          <AddressScreeningProvider>
            {children}
            <AddressScreeningModal />
          </AddressScreeningProvider>
        </RequestTrackingProvider>
      </PersistQueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
