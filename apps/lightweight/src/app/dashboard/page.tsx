import MorphoLogoSvg from "@morpho-blue-offchain-public/uikit/assets/morpho.svg?react";
import { Button } from "@morpho-blue-offchain-public/uikit/components/shadcn/button";
import { WalletMenu } from "@morpho-blue-offchain-public/uikit/components/wallet-menu";
import { getChainSlug } from "@morpho-blue-offchain-public/uikit/lib/utils";
import { ConnectKitButton } from "connectkit";
import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { Link, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { extractChain } from "viem";
import { useChains } from "wagmi";

import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { ADDRESSES_DOCUMENTATION, APP_DETAILS, CORE_DEPLOYMENTS } from "@/lib/constants";

enum SubPage {
  Earn = "earn",
  Borrow = "borrow",
}

function ConnectWalletButton() {
  return (
    <ConnectKitButton.Custom>
      {({ show }) => {
        return (
          <Button variant="blue" size="lg" className="rounded-full font-light" onClick={show}>
            Connect Wallet
          </Button>
        );
      }}
    </ConnectKitButton.Custom>
  );
}

export default function Page() {
  const navigate = useNavigate();
  const { chain: selectedChainSlug } = useParams();

  const location = useLocation();
  const locationSegments = location.pathname.toLowerCase().split("/").slice(1);
  const selectedSubPage = locationSegments.at(1) === SubPage.Borrow ? SubPage.Borrow : SubPage.Earn;

  const chains = useChains();
  const chain = useMemo(
    () => chains.find((chain) => getChainSlug(chain) === selectedChainSlug),
    [chains, selectedChainSlug],
  );

  const setSelectedChainSlug = useCallback(
    (value: string) => {
      void navigate(`../${value}/${selectedSubPage}`, { replace: true, relative: "path" });
      // If selected chain is a core deployment, open main app in a new tab (we don't navigate away in
      // case they're using this because the main app is down).
      if ([...CORE_DEPLOYMENTS].map((id) => getChainSlug(extractChain({ chains, id }))).includes(value)) {
        window.open(`https://app.morpho.org/${value}/${selectedSubPage}`, "_blank", "noopener,noreferrer");
      }
    },
    [navigate, selectedSubPage, chains],
  );

  useEffect(() => {
    document.title = `${APP_DETAILS.name} | ${selectedSubPage.charAt(0).toUpperCase()}${selectedSubPage.slice(1)}`;
  }, [selectedSubPage]);

  return (
    <div className="bg-gray-200 dark:bg-neutral-900">
      <Header className="flex items-center justify-between px-5 py-3" chainId={chain?.id}>
        <div className="flex gap-4">
          <div className="text-primary flex items-center gap-2 text-xl">
            <MorphoLogoSvg width={24} height={24} />
            Morpho
          </div>
          <div className="flex items-center gap-2 rounded-full bg-transparent p-1">
            <Link to={SubPage.Earn} relative="path">
              <Button
                variant={selectedSubPage === SubPage.Earn ? "tertiary" : "secondaryTab"}
                size="lg"
                className="rounded-full font-light"
              >
                Earn
              </Button>
            </Link>
            <Link to={SubPage.Borrow} relative="path">
              <Button
                variant={selectedSubPage === SubPage.Borrow ? "tertiary" : "secondaryTab"}
                size="lg"
                className="rounded-full font-light"
              >
                Borrow
              </Button>
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="tertiary"
            size="lg"
            className="rounded-full font-light"
            onClick={() => window.open(ADDRESSES_DOCUMENTATION, "_blank", "noopener,noreferrer")}
          >
            Docs <ExternalLink />
          </Button>
          <WalletMenu
            selectedChainSlug={selectedChainSlug!}
            setSelectedChainSlug={setSelectedChainSlug}
            connectWalletButton={<ConnectWalletButton />}
          />
        </div>
      </Header>
      <Outlet context={{ chain }} />
      <Footer />
    </div>
  );
}
