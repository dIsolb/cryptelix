import { X, BarChart2, Shield, Zap, ExternalLink, CheckCircle2, Copy, RefreshCw } from 'lucide-react';
import { useState } from 'react';

interface ConnectTradingViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: () => void;
}

export function ConnectTradingViewModal({ isOpen, onClose, onConnect }: ConnectTradingViewModalProps) {
  const [webhook, setWebhook] = useState('https://cryptelix.app/webhook/tv_' + Math.random().toString(36).substr(2, 9));
  const [apiToken, setApiToken] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhook);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateNewWebhook = () => {
    setWebhook('https://cryptelix.app/webhook/tv_' + Math.random().toString(36).substr(2, 9));
  };

  const handleConnect = () => {
    if (!apiToken) return;
    
    // Simulate connection
    setTimeout(() => {
      onConnect();
      onClose();
      setApiToken('');
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
      <div className="relative w-full max-w-3xl mx-4 bg-zinc-900 rounded-2xl border border-yellow-500/20 shadow-2xl shadow-yellow-500/10 overflow-hidden">
        {/* Header */}
        <div className="relative border-b border-zinc-800 bg-gradient-to-r from-zinc-900 via-zinc-900 to-yellow-500/5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Connect TradingView</h2>
              <p className="text-sm text-gray-400">Sync your TradingView alerts and signals</p>
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

        {/* Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {/* Features */}
          <div className="mb-6 grid grid-cols-3 gap-3">
            <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-700/50 text-center">
              <Zap className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
              <p className="text-xs font-medium text-gray-300">Real-time Alerts</p>
            </div>
            <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-700/50 text-center">
              <BarChart2 className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
              <p className="text-xs font-medium text-gray-300">Auto-sync Charts</p>
            </div>
            <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-700/50 text-center">
              <Shield className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
              <p className="text-xs font-medium text-gray-300">Secure Webhook</p>
            </div>
          </div>

          {/* Setup Steps */}
          <div className="space-y-6">
            {/* Step 1: Webhook URL */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-yellow-500 text-black text-xs font-bold flex items-center justify-center">
                  1
                </div>
                <h3 className="text-sm font-semibold text-white">Copy Your Webhook URL</h3>
              </div>
              <div className="ml-8 space-y-3">
                <p className="text-sm text-gray-400">
                  Use this unique webhook URL in your TradingView alerts to send signals to Cryptelix.
                </p>
                <div className="relative">
                  <input
                    type="text"
                    value={webhook}
                    readOnly
                    className="w-full px-4 py-3 pr-24 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-yellow-500/50 font-mono"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                    <button
                      onClick={handleGenerateNewWebhook}
                      className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
                      title="Generate new webhook"
                    >
                      <RefreshCw className="w-4 h-4 text-gray-400" />
                    </button>
                    <button
                      onClick={handleCopyWebhook}
                      className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
                    >
                      {copied ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: TradingView Setup */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-yellow-500 text-black text-xs font-bold flex items-center justify-center">
                  2
                </div>
                <h3 className="text-sm font-semibold text-white">Configure TradingView Alert</h3>
              </div>
              <div className="ml-8 space-y-3">
                <div className="p-4 bg-zinc-800/30 rounded-xl border border-zinc-700/50">
                  <ol className="space-y-2 text-sm text-gray-300">
                    <li className="flex items-start gap-2">
                      <span className="text-yellow-500 font-mono">→</span>
                      <span>Open TradingView and create an alert on your chart</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-yellow-500 font-mono">→</span>
                      <span>In the alert settings, select "Webhook URL"</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-yellow-500 font-mono">→</span>
                      <span>Paste your webhook URL from above</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-yellow-500 font-mono">→</span>
                      <span>Add your custom message/alert data</span>
                    </li>
                  </ol>
                </div>
                <a
                  href="#"
                  className="inline-flex items-center gap-1 text-sm text-yellow-500 hover:text-yellow-400 transition-colors"
                >
                  <span>View detailed setup guide</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Step 3: API Token (Optional) */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-yellow-500 text-black text-xs font-bold flex items-center justify-center">
                  3
                </div>
                <h3 className="text-sm font-semibold text-white">Enter API Token (Optional)</h3>
              </div>
              <div className="ml-8 space-y-3">
                <p className="text-sm text-gray-400">
                  For advanced features like chart syncing and portfolio integration, enter your TradingView API token.
                </p>
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="Enter TradingView API token (optional)"
                  className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Security Notice */}
          <div className="mt-6 p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
            <div className="flex gap-3">
              <Shield className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-gray-300 mb-1">
                  <span className="font-semibold text-white">Encrypted Connection:</span>
                </p>
                <p className="text-gray-400 text-xs">
                  All webhook data is encrypted in transit. Your alerts are processed securely and never shared.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConnect}
              className="px-6 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold rounded-lg transition-all shadow-lg shadow-yellow-500/20"
            >
              Complete Setup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}