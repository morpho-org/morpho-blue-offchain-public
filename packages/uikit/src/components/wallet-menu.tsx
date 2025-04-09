import { blo } from "blo";
import { PowerOff } from "lucide-react";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { type Address } from "viem";
import {
  useAccount,
  useAccountEffect,
  useConnect,
  useDisconnect,
  useEnsAvatar,
  useEnsName,
  useSwitchChain,
} from "wagmi";

import { ChainIcon } from "@/components/chain-icon";
import { Avatar, AvatarImage } from "@/components/shadcn/avatar";
import { Button } from "@/components/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shadcn/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { abbreviateAddress, getChainSlug } from "@/lib/utils";

function ConnectWalletButton() {
  const { connectors, connect } = useConnect();

  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="blue" size="lg" className="rounded-full font-light">
          Connect Wallet
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Connect Wallet</DialogTitle>
          <DialogDescription>
            Please exercise caution. This is not the main Morpho interface. The following wallets were detected:
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {connectors.map((connector) => (
            <Button
              key={connector.uid}
              variant="outline"
              onClick={() => {
                // Manually close the modal when the connector is connecting
                // This indicates the connector's modal/popup is or will soon be open
                connector.emitter.once("connect", () => setIsDialogOpen(false));
                connect({ connector });
              }}
            >
              {connector.icon && <img width={20} height={20} src={connector.icon} alt={`${connector.name} icon`} />}
              {connector.name}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <i className="text-secondary-foreground text-xs font-light">
            This tool is provided “as is”, at your own risk, and without warranties of any kind. No developer or entity
            involved in creating the tool will be liable for any claims or damages whatsoever associated with your use,
            inability to use, or your interaction with other users of, the tool, including any direct, indirect,
            incidental, special, exemplary, punitive or consequential damages, or loss of profits, cryptocurrencies,
            tokens, or anything else of value.
          </i>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WalletButton({ address }: { address: Address }) {
  const { disconnect } = useDisconnect();
  const { data: ensName } = useEnsName({ address });
  const { data: ensAvatar } = useEnsAvatar({ name: ensName ?? undefined });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="tertiary" size="lg" className="rounded-full p-4 font-light">
          <Avatar className="h-4 w-4">
            <AvatarImage src={ensAvatar ?? blo(address)} alt="Avatar" />
          </Avatar>
          {ensName ?? abbreviateAddress(address)}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-min rounded-xl">
        <div className="flex items-center gap-2 font-mono font-light">
          <Avatar className="h-4 w-4">
            <AvatarImage src={ensAvatar ?? blo(address)} alt="Avatar" />
          </Avatar>
          {`${address.slice(0, 10)}...${address.slice(-8)}`}
          <Button variant="outline" onClick={() => disconnect()}>
            <PowerOff />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function WalletMenu({
  selectedChainSlug,
  setSelectedChainSlug,
  connectWalletButton = <ConnectWalletButton />,
}: {
  selectedChainSlug: string;
  setSelectedChainSlug: (value: string) => void;
  connectWalletButton?: ReactNode;
}) {
  const [didInitialSync, setDidInitialSync] = useState(false);

  const { chain: chainInWallet, address, status } = useAccount();
  const { chains, switchChain } = useSwitchChain();
  useAccountEffect({ onDisconnect: () => setDidInitialSync(false) });

  // The chain currently selected and shown in the UI, as specified by `[selectedChainSlug, setSelectedChainSlug]`,
  // which may come from a simple `useState` or URL parsing + navigation.
  const chainInUi = useMemo(
    () => chains.find((chain) => getChainSlug(chain) === selectedChainSlug),
    [chains, selectedChainSlug],
  );

  useEffect(() => {
    // Wallet isn't connected, so we can't do anything.
    if (status !== "connected") return;

    if (!didInitialSync && chainInUi?.id !== undefined) {
      // Need initial sync (adjust wallet to match `chainInUi`)
      if (chainInUi.id !== chainInWallet?.id) {
        switchChain({ chainId: chainInUi.id }, { onSuccess: () => setDidInitialSync(true) });
      } else {
        setDidInitialSync(true);
      }
      return;
    }

    if (didInitialSync && chainInWallet?.id !== undefined && chainInWallet.id !== chainInUi?.id) {
      // After initial sync, updates flow the other way (adjust UI to match `chainInWallet`)
      setSelectedChainSlug(getChainSlug(chainInWallet));
      return;
    }
  }, [status, didInitialSync, chainInWallet, chainInUi?.id, switchChain, setSelectedChainSlug]);

  return (
    <>
      <Select
        value={selectedChainSlug}
        onValueChange={(value: string) => {
          const target = chains.find((chain) => getChainSlug(chain) === value);
          if (target && getChainSlug(target) !== selectedChainSlug) {
            if (status === "connected") {
              switchChain({ chainId: target.id });
            } else {
              setSelectedChainSlug(getChainSlug(target));
            }
          }
        }}
      >
        <SelectTrigger className="bg-tertiary-dark h-[40px] w-16 rounded-full">
          <SelectValue aria-label={chainInUi?.name}>
            <ChainIcon id={chainInUi?.id} />
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {chains.map((chain, idx) => (
              <SelectItem key={idx} value={getChainSlug(chain)}>
                <ChainIcon id={chain.id} /> {chain.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {status === "connected" && address ? <WalletButton address={address} /> : connectWalletButton}
    </>
  );
}
