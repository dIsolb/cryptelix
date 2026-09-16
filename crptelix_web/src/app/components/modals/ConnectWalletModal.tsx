import { X, Shield, Zap, ExternalLink } from 'lucide-react';

interface ConnectWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: () => void;
}

const wallets = [
  {
    name: 'MetaMask',
    description: 'Connect to your MetaMask wallet',
    logoUrl: '/wallet-logos/metamask.svg',
    logoFallback: 'MM',
    popular: true,
  },
  {
    name: 'WalletConnect',
    description: 'Scan with WalletConnect to connect',
    logoUrl: '/wallet-logos/walletconnect.svg',
    logoFallback: 'WC',
    popular: true,
  },
  {
    name: 'Coinbase Wallet',
    description: 'Connect with Coinbase Wallet',
    logoUrl: '/wallet-logos/coinbase_wallet_new.png',
    logoFallback: 'CB',
    popular: false,
  },
  {
    name: 'Trust Wallet',
    description: 'Connect to Trust Wallet',
    logoUrl: '/wallet-logos/trust-wallet.png',
    logoFallback: 'TW',
    popular: false,
  },
  {
    name: 'Phantom',
    description: 'Solana wallet integration',
    logoUrl: '/wallet-logos/phantom.svg',
    logoFallback: 'PH',
    popular: false,
  },
  {
    name: 'Ledger',
    description: 'Hardware wallet connection',
    logoUrl: '/wallet-logos/ledger.svg',
    logoFallback: 'LG',
    popular: false,
  },
];

export function ConnectWalletModal({ isOpen, onClose, onConnect }: ConnectWalletModalProps) {
  if (!isOpen) return null;

  const handleWalletConnect = (walletName: string) => {
    // Simulate connection
    setTimeout(() => {
      onConnect();
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl mx-4 bg-zinc-900 rounded-2xl border border-yellow-500/20 shadow-2xl shadow-yellow-500/10 overflow-hidden">
        {/* Header */}
        <div className="relative border-b border-zinc-800 bg-gradient-to-r from-zinc-900 via-zinc-900 to-yellow-500/5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Connect Wallet</h2>
              <p className="text-sm text-gray-400">Choose your preferred wallet to connect</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors z-10 relative"
            >
              <X className="w-5 h-5 text-gray-300 hover:text-white" />
            </button>
          </div>
          
          {/* Decorative glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-yellow-500/10 blur-3xl rounded-full pointer-events-none" />
        </div>

        {/* Security Info */}
        <div className="px-6 py-4 bg-yellow-500/5 border-b border-yellow-500/10">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-gray-300">
                <span className="font-semibold text-white">Secure Connection:</span> We never store your private keys. 
                Your wallet connection is encrypted end-to-end.
              </p>
            </div>
          </div>
        </div>

        {/* Wallet Options */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          <div className="grid gap-3">
            {wallets.map((wallet) => (
              <button
                key={wallet.name}
                onClick={() => handleWalletConnect(wallet.name)}
                className="relative group w-full p-4 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl border border-zinc-700/50 hover:border-yellow-500/50 transition-all text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 flex-shrink-0 flex items-center justify-center">
                    <img
                      src={wallet.logoUrl}
                      alt={`${wallet.name} logo`}
                      className="h-10 w-10 object-contain"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const fallback = e.currentTarget.nextElementSibling as HTMLSpanElement | null;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                    <span className="hidden h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 text-xs font-bold text-zinc-300">
                      {wallet.logoFallback}
                    </span>
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-white">{wallet.name}</h3>
                      {wallet.popular && (
                        <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-500 text-xs font-medium rounded-full border border-yellow-500/30">
                          Popular
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-400">{wallet.description}</p>
                  </div>

                  {/* Arrow */}
                  <ExternalLink className="w-5 h-5 text-gray-500 group-hover:text-yellow-500 transition-colors" />
                </div>

                {/* Hover glow */}
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-yellow-500/5 to-transparent" />
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-gray-400">
              <Zap className="w-4 h-4 text-yellow-500" />
              <span>Instant connection with Web3 providers</span>
            </div>
            <a href="#" className="text-yellow-500 hover:text-yellow-400 transition-colors flex items-center gap-1">
              Learn more
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}