import { ethErrors } from 'eth-rpc-errors';
import {
  keyringService,
  notificationService,
  permissionService,
  preferenceService,
  contractWhitelistService,
  openapiService,
} from '@/background/service';
import { PromiseFlow, underline2Camelcase } from '@/background/utils';
import { EVENTS } from 'consts';
import providerController from './controller';
import eventBus from '@/eventBus';
import { resemblesETHAddress } from '@/utils';
import { ProviderRequest } from './type';
import stats from '@/stats';
import { addHexPrefix, intToHex, stripHexPrefix } from '@ethereumjs/util';
import { findChain } from '@/utils/chain';
import { waitSignComponentAmounted } from '@/utils/signEvent';
import { gnosisController } from './gnosisController';
import { Account } from '@/background/service/preference';
import { bgRetryTxMethods } from '@/background/utils/errorTxRetry';
import { hexToNumber } from 'viem';
import BigNumber from 'bignumber.js';
import { agent as agentService } from '@/background/service/agent';
import { transactionHistoryService } from '@/background/service';
import { walletController } from '@/background/controller';
import { CHAINS_ENUM } from 'consts';
import { buildTxApprovalResWithPreExec } from './txHelper';
import { broadcastChainChanged } from '../utils';

const isSignApproval = (type: string) => {
  const SIGN_APPROVALS = ['SignText', 'SignTypedData', 'SignTx'];
  return SIGN_APPROVALS.includes(type);
};

const lockedOrigins = new Set<string>();
const connectOrigins = new Set<string>();

const getScreenAvailHeight = async () => {
  return 1000;
};

const flow = new PromiseFlow<{
  request: ProviderRequest & {
    session: Exclude<ProviderRequest, void>;
  };
  mapMethod: string;
  approvalRes: any;
}>();
const flowContext = flow
  .use(async (ctx, next) => {
    // check method
    const {
      data: { method },
    } = ctx.request;
    ctx.mapMethod = underline2Camelcase(method);
    if (Reflect.getMetadata('PRIVATE', providerController, ctx.mapMethod)) {
      // Reject when dapp try to call private controller function
      throw ethErrors.rpc.methodNotFound({
        message: `method [${method}] doesn't has corresponding handler`,
        data: ctx.request.data,
      });
    }
    if (!providerController[ctx.mapMethod]) {
      // TODO: make rpc whitelist
      if (method.startsWith('eth_') || method === 'net_version') {
        return providerController.ethRpc(ctx.request);
      }

      throw ethErrors.rpc.methodNotFound({
        message: `method [${method}] doesn't has corresponding handler`,
        data: ctx.request.data,
      });
    }

    return next();
  })
  .use(async (ctx, next) => {
    const {
      mapMethod,
      request: {
        session: { origin },
        data,
      },
    } = ctx;

    if (!Reflect.getMetadata('SAFE', providerController, mapMethod)) {
      // check lock
      const isUnlock = keyringService.memStore.getState().isUnlocked;
      const isConnected = permissionService.hasPermission(origin);
      const hasOtherProvider = !!data?.$ctx?.providers?.length;

      /**
       * if not connected and has other provider ignore lock check
       */
      if (!isConnected && hasOtherProvider) {
        return next();
      }
      if (!isUnlock) {
        if (lockedOrigins.has(origin)) {
          throw ethErrors.rpc.resourceNotFound(
            'Already processing unlock. Please wait.'
          );
        }
        ctx.request.requestedApproval = true;
        lockedOrigins.add(origin);
        try {
          await notificationService.requestApproval(
            { lock: true },
            { height: 628 }
          );
          lockedOrigins.delete(origin);
        } catch (e) {
          lockedOrigins.delete(origin);
          throw e;
        }
      }
    }

    return next();
  })
  .use(async (ctx, next) => {
    // check connect
    const {
      request: {
        session: { origin, name, icon },
        data,
      },
      mapMethod,
    } = ctx;
    if (!Reflect.getMetadata('SAFE', providerController, mapMethod)) {
      if (!permissionService.hasPermission(origin)) {
        if (connectOrigins.has(origin)) {
          throw ethErrors.rpc.resourceNotFound(
            'Already processing connect. Please wait.'
          );
        }
        ctx.request.requestedApproval = true;
        connectOrigins.add(origin);
        try {
          const isUnlock = keyringService.memStore.getState().isUnlocked;

          // If Agent Sidebar is connected and wallet is unlocked, auto-authorize connect
          const agentConnected = agentService && (agentService as any)['ports'] && (agentService as any)['ports'].has('rabby-agent-connection');
          if (isUnlock && agentConnected) {
            // Ensure we have a valid default account to return to dapp
            let defaultAccount = ctx.request.account || preferenceService.getCurrentAccount();
            if (!defaultAccount) {
              try {
                const accounts = await keyringService.getAllVisibleAccountsArray();
                if (accounts && accounts.length > 0) {
                  defaultAccount = accounts[0];
                }
              } catch (e) {
                console.error('Failed to load accounts for auto-connect:', e);
              }
            }

            const site = permissionService.getSite(origin);
            const defaultChain = site?.chain || CHAINS_ENUM.ETH;
            const isEnabledDappAccount = preferenceService.getPreference('isEnabledDappAccount');

            // If global dapp account override not enabled, set current account globally to trigger events
            if (!isEnabledDappAccount && defaultAccount) {
              preferenceService.setCurrentAccount(defaultAccount);
            }

            permissionService.addConnectedSiteV2({
              origin,
              name,
              icon,
              defaultChain,
              defaultAccount: isEnabledDappAccount ? (defaultAccount || undefined) : undefined,
            });

            // Attach account to request so eth_requestAccounts returns it
            ctx.request.account = defaultAccount || preferenceService.getCurrentAccount() || undefined;

            // Notify Agent Sidebar about auto-connection
            try {
              agentService.broadcastMessage({
                type: 'wallet_auto_connected',
                timestamp: Date.now(),
                data: {
                  origin,
                  name,
                  account: defaultAccount,
                  details: `Automatically connected wallet to ${name || origin}`,
                },
              });
            } catch (error) {
              console.error('Failed to notify Agent Sidebar about auto-connection:', error);
            }
          } else {
            // Use popup approval when Sidebar is not connected
            const {
              defaultChain,
              defaultAccount,
            } = await notificationService.requestApproval(
              {
                params: { origin, name, icon, $ctx: data.$ctx },
                account: ctx.request.account,
                approvalComponent: 'Connect',
              },
              { height: isUnlock ? 800 : 628 }
            );
            const isEnabledDappAccount = preferenceService.getPreference(
              'isEnabledDappAccount'
            );
            if (!isEnabledDappAccount) {
              preferenceService.setCurrentAccount(defaultAccount);
            }
            permissionService.addConnectedSiteV2({
              origin,
              name,
              icon,
              defaultChain,
              defaultAccount: isEnabledDappAccount
                ? defaultAccount || preferenceService.getCurrentAccount()
                : undefined,
            });
            ctx.request.account =
              defaultAccount || preferenceService.getCurrentAccount();
          }
          connectOrigins.delete(origin);
        } catch (e) {
          console.error(e);
          connectOrigins.delete(origin);
          throw e;
        }
      }
    }

    return next();
  })
  .use(async (ctx, next) => {
    // Auto-resolve chain from incoming RPC when Sidebar is connected
    const {
      request: {
        data: { method, params },
        session: { origin, name, icon },
      },
    } = ctx;

    const agentConnected = agentService && (agentService as any)['ports'] && (agentService as any)['ports'].has('rabby-agent-connection');
    const isUnlock = keyringService.memStore.getState().isUnlocked;
    if (!isUnlock || !agentConnected) return next();

    // Helper: extract desired chainId number from various RPC methods
    const extractDesiredChainId = (m?: string, p?: any[]): number | null => {
      if (!m) return null;
      try {
        const lower = m.toLowerCase();
        // wallet_switchEthereumChain / wallet_addEthereumChain handled later, but extract here for consistency
        if (lower === 'wallet_switchethereumchain' || lower === 'wallet_addethereumchain') {
          const cid = p?.[0]?.chainId;
          if (typeof cid === 'number') return cid;
          if (typeof cid === 'string') return cid.startsWith('0x') ? parseInt(cid, 16) : parseInt(cid, 10);
        }
        if (lower === 'eth_sendtransaction') {
          const cid = p?.[0]?.chainId;
          if (typeof cid === 'number') return cid;
          if (typeof cid === 'string') return cid.startsWith('0x') ? parseInt(cid, 16) : parseInt(cid, 10);
        }
        // Try to parse typed data domain.chainId for signTypedData variants
        if (lower === 'eth_signtypeddata' || lower === 'eth_signtypeddata_v1' || lower === 'eth_signtypeddata_v3' || lower === 'eth_signtypeddata_v4') {
          const candidates: any[] = Array.isArray(p) ? p : [];
          for (const c of candidates) {
            if (!c) continue;
            if (typeof c === 'string') {
              try {
                const obj = JSON.parse(c);
                const cid = obj?.domain?.chainId;
                if (typeof cid === 'number') return cid;
                if (typeof cid === 'string') return cid.startsWith('0x') ? parseInt(cid, 16) : parseInt(cid, 10);
              } catch {}
            } else if (typeof c === 'object') {
              const cid = c?.domain?.chainId;
              if (typeof cid === 'number') return cid;
              if (typeof cid === 'string') return cid.startsWith('0x') ? parseInt(cid, 16) : parseInt(cid, 10);
            }
          }
        }
      } catch {}
      return null;
    };

    const desiredIdNum = extractDesiredChainId(method, params);
    if (!desiredIdNum) return next();

    try {
      const site = permissionService.getConnectedSite(origin);
      const currentEnum = site?.chain;
      const current = currentEnum ? findChain({ enum: currentEnum }) : null;
      if (current && Number(current.id) === Number(desiredIdNum)) {
        return next();
      }

      let target = findChain({ id: desiredIdNum });
      if (!target) {
        // Try to fetch chain metadata from API and auto-add
        try {
          const res = await openapiService.getChainListByIds({ ids: String(desiredIdNum) });
          const item = res?.[0];
          if (item) {
            const chainBase: any = {
              id: item.chain_id,
              name: item.name,
              nativeTokenSymbol: item.native_currency?.symbol || 'ETH',
              rpcUrl: item.rpc || '',
              scanLink: item.explorer || '',
            };
            const addRes = await walletController.addCustomTestnet(chainBase, { ga: { source: 'dapp' } });
            if ((addRes as any)?.error) throw new Error((addRes as any).error?.message || 'Failed to add custom network');
            target = findChain({ id: chainBase.id });
            (ctx as any)._autoNetworkAdded = true;
          }
        } catch {}
      }

      if (target) {
        // Update connected site and broadcast
        const isEnabledDappAccount = preferenceService.getPreference('isEnabledDappAccount');
        const defaultAccount = ctx.request.account || preferenceService.getCurrentAccount();
        permissionService.updateConnectSite(origin, { chain: (target as any).enum }, true);
        if (!permissionService.hasPermission(origin)) {
          permissionService.addConnectedSiteV2({
            origin,
            name,
            icon,
            defaultChain: (target as any).enum,
            defaultAccount: isEnabledDappAccount ? (defaultAccount || undefined) : undefined,
          });
        }
        broadcastChainChanged({ origin, chain: target as any });

        try {
          agentService.broadcastMessage({
            type: 'execution',
            actor: 'SYSTEM',
            state: 'TASK_OK',
            timestamp: Date.now(),
            data: {
              details: (ctx as any)._autoNetworkAdded
                ? `Added custom network and switched: ${(target as any).name} (chainId ${desiredIdNum})`
                : `Switched network: ${(target as any).name} (chainId ${desiredIdNum})`,
            },
          });
        } catch {}
      }
    } catch {
      // ignore failures; fall through
    }

    return next();
  })
  .use(async (ctx, next) => {
    // check need approval
    const {
      request: {
        data: { params, method },
        session: { origin, name, icon },
      },
      mapMethod,
    } = ctx;
    const [approvalType, condition, options = {}] =
      Reflect.getMetadata('APPROVAL', providerController, mapMethod) || [];
    let windowHeight = 800;
    if ('height' in options) {
      windowHeight = options.height;
    } else {
      const minHeight = 500;
      const screenAvailHeight = await getScreenAvailHeight();
      if (screenAvailHeight < 880) {
        windowHeight = screenAvailHeight;
      }
      if (windowHeight < minHeight) {
        windowHeight = minHeight;
      }
    }
    if (approvalType === 'SignText') {
      let from, message;
      const [first, second] = params;
      // Compatible with wrong params order
      // ref: https://github.com/MetaMask/eth-json-rpc-middleware/blob/53c7361944c380e011f5f4ee1e184db746e26d73/src/wallet.ts#L284
      if (resemblesETHAddress(first) && !resemblesETHAddress(second)) {
        from = first;
        message = second;
      } else {
        from = second;
        message = first;
      }
      const hexReg = /^[0-9A-Fa-f]+$/gu;
      const stripped = stripHexPrefix(message);
      if (stripped.match(hexReg)) {
        message = addHexPrefix(stripped);
      }
      ctx.request.data.params[0] = message;
      ctx.request.data.params[1] = from;
    }
    // Determine whether approval UI is needed; handle special cases for chain switching/addition
    let needApproval = false;
    let autoHandled = false;
    try {
      needApproval = !!approvalType && (!condition || !condition(ctx.request));
    } catch (e: any) {
      needApproval = true;
    }

    // Auto-handle chain switching or adding when Agent Sidebar is connected
    if (needApproval && (approvalType === 'SwitchChain' || approvalType === 'AddChain')) {
      const agentConnected = agentService && (agentService as any)['ports'] && (agentService as any)['ports'].has('rabby-agent-connection');
      const isUnlock = keyringService.memStore.getState().isUnlocked;
      if (isUnlock && agentConnected) {
        try {
          const params0 = params?.[0] || {};
          // Normalize chainId (may be hex or number)
          let desiredIdNum: number | null = null;
          if (approvalType === 'SwitchChain') {
            const cid = params0.chainId;
            if (typeof cid === 'number') desiredIdNum = cid;
            else if (typeof cid === 'string') {
              desiredIdNum = cid.startsWith('0x') ? parseInt(cid, 16) : parseInt(cid, 10);
            }
          } else {
            const cid = params0.chainId;
            if (typeof cid === 'number') desiredIdNum = cid;
            else if (typeof cid === 'string') {
              desiredIdNum = cid.startsWith('0x') ? parseInt(cid, 16) : parseInt(cid, 10);
            }
          }

          let targetChain = desiredIdNum ? findChain({ id: desiredIdNum }) : null;

          // If chain not found, try to create a custom network automatically
          if (!targetChain) {
            if (approvalType === 'AddChain') {
              const chainBase = {
                id: desiredIdNum || 0,
                name: params0.chainName || `Chain ${desiredIdNum || ''}`,
                nativeTokenSymbol: params0?.nativeCurrency?.symbol || 'ETH',
                rpcUrl: (params0?.rpcUrls && params0.rpcUrls[0]) || '',
                scanLink: (params0?.blockExplorerUrls && params0.blockExplorerUrls[0]) || '',
              } as any;
              const res = await walletController.addCustomTestnet(chainBase, { ga: { source: 'dapp' } });
              if ((res as any)?.error) throw new Error((res as any).error?.message || 'Failed to add custom network');
              targetChain = findChain({ id: chainBase.id });
              (ctx as any)._autoNetworkAdded = true;
            } else if (approvalType === 'SwitchChain' && desiredIdNum) {
              try {
                const fetched = await openapiService.getChainListByIds({ ids: String(desiredIdNum) });
                const item = fetched?.[0];
                if (item) {
                  const chainBase = {
                    id: item.chain_id,
                    name: item.name,
                    nativeTokenSymbol: item.native_currency?.symbol || 'ETH',
                    rpcUrl: item.rpc || '',
                    scanLink: item.explorer || '',
                  } as any;
                  const res = await walletController.addCustomTestnet(chainBase, { ga: { source: 'dapp' } });
                  if ((res as any)?.error) throw new Error((res as any).error?.message || 'Failed to add custom network');
                  targetChain = findChain({ id: chainBase.id });
                  (ctx as any)._autoNetworkAdded = true;
                }
              } catch (e) {
                // ignore; fallback to approval
              }
            }
          }

          if (targetChain) {
            // Update connected site and broadcast chain changed
            const { origin, name, icon } = ctx.request.session || {};
            const isEnabledDappAccount = preferenceService.getPreference('isEnabledDappAccount');
            const defaultAccount = ctx.request.account || preferenceService.getCurrentAccount();
            permissionService.updateConnectSite(origin, { chain: (targetChain as any).enum }, true);
            if (!permissionService.hasPermission(origin)) {
              permissionService.addConnectedSiteV2({
                origin,
                name,
                icon,
                defaultChain: (targetChain as any).enum,
                defaultAccount: isEnabledDappAccount ? (defaultAccount || undefined) : undefined,
              });
            }
            broadcastChainChanged({ origin, chain: targetChain as any });

            // Inform Agent sidebar
            try {
              agentService.broadcastMessage({
                type: 'execution',
                actor: 'SYSTEM',
                state: 'TASK_OK',
                timestamp: Date.now(),
                data: {
                  details: (ctx as any)._autoNetworkAdded
                    ? `Added custom network and switched: ${(targetChain as any).name} (chainId ${desiredIdNum})`
                    : `Switched network: ${(targetChain as any).name} (chainId ${desiredIdNum})`,
                },
              });
            } catch {}

            autoHandled = true;
            needApproval = false;
          }
        } catch (e) {
          // If auto handling fails for other reasons, fall back to default flow below
          // but only if the original error is not the specific chain unrecognized error
        }
      }
    }

    if (needApproval && !autoHandled) {
      ctx.request.requestedApproval = true;
      if (approvalType === 'SignTx' && !('chainId' in params[0])) {
        const site = permissionService.getConnectedSite(origin);
        if (site) {
          const chain = findChain({
            enum: site.chain,
          });
          if (chain) {
            params[0].chainId = chain.id;
          }
        }
      }

      // Check if Agent Sidebar is connected and wallet is unlocked
      const agentConnected = agentService && (agentService as any)['ports'] && (agentService as any)['ports'].has('rabby-agent-connection');
      const isUnlock = keyringService.memStore.getState().isUnlocked;
      if (isUnlock && agentConnected) {
        // For SignText/SignTypedData: auto-approve when Sidebar is connected
        if (approvalType === 'SignText' || approvalType === 'SignTypedData') {
          ctx.approvalRes = { extra: { $ctx: ctx?.request?.data?.$ctx } } as any;
          permissionService.updateConnectSite(origin, { isSigned: true }, true);

          // Notify Agent Sidebar about auto-signing
          try {
            const signData = params[0];
            const signMessage = typeof signData === 'string' ? signData : JSON.stringify(signData);
            agentService.broadcastMessage({
              type: 'wallet_auto_signed',
              timestamp: Date.now(),
              data: {
                origin,
                name,
                signType: approvalType,
                message: signMessage.length > 100 ? signMessage.substring(0, 100) + '...' : signMessage,
                details: `Automatically signed ${approvalType === 'SignText' ? 'text message' : 'typed data'} for ${name || origin}`,
              },
            });
          } catch (error) {
            console.error('Failed to notify Agent Sidebar about auto-signing:', error);
          }
        } else if (approvalType === 'SignTx') {
          // Handle contract transaction - always require Sidebar confirmation
          const txParams = params[0];
          const account = ctx.request.account || preferenceService.getCurrentAccount();
          const chain = findChain({ id: txParams.chainId });

          // Check if contract is whitelisted for auto-approval
          const isWhitelisted = contractWhitelistService.isWhitelisted(txParams.to, chain?.id);

          if (isWhitelisted) {
            // Auto-approve whitelisted contracts using helper
            const { approvalRes } = await buildTxApprovalResWithPreExec({
              txParams,
              account,
              origin: origin || '',
            });
            ctx.approvalRes = approvalRes;

            // Notify Agent Sidebar about auto-approved transaction
            try {
              agentService.broadcastMessage({
                type: 'wallet_auto_approved_tx',
                timestamp: Date.now(),
                data: {
                  origin,
                  name,
                  txParams,
                  contractAddress: txParams.to,
                  chainId: txParams.chainId,
                  details: `Automatically approved transaction to whitelisted contract ${txParams.to} for ${name || origin}`,
                },
              });
            } catch (error) {
              console.error('Failed to notify Agent Sidebar about auto-approved transaction:', error);
            }
          } else {
            // Send confirmation request to Sidebar for non-whitelisted contracts
            // Do NOT pre-exec here; let Sidebar trigger simulation to mirror wallet popup behavior
            // Normalize minimum required fields
            try {
              if (account?.address && (!txParams.from || String(txParams.from).toLowerCase() !== String(account.address).toLowerCase())) {
                txParams.from = account.address;
              }
              if (!txParams.chainId && chain?.id) {
                txParams.chainId = chain.id;
              }
            } catch {}

            const chainForUI: any = chain || {
              id: txParams.chainId || 0,
              name: 'Unknown',
              nativeTokenSymbol: 'ETH',
            };

            const minimalApprovalTx = {
              chainId: txParams.chainId,
              to: txParams.to,
              from: txParams.from,
              data: txParams.data || '0x',
              value: txParams.value || '0x0',
              gas: txParams.gas || '0x0',
              gasPrice: txParams.gasPrice || '0x0',
              maxFeePerGas: txParams.maxFeePerGas,
              maxPriorityFeePerGas: txParams.maxPriorityFeePerGas,
              nonce: '0x0',
            } as any;

            const confirmationData = {
              txParams: minimalApprovalTx,
              preExecResult: undefined,
              chain: chainForUI,
              account,
              origin,
              estimatedGas: undefined,
              simulating: true,
            };

            // Create a signingTxId like popup does, so downstream ethSendTransaction can find it
            try {
              const signingTxId = transactionHistoryService.addSigningTx(minimalApprovalTx as any);
              (confirmationData as any).txParams.signingTxId = signingTxId;
            } catch {}

            ctx.approvalRes = await new Promise((resolve, reject) => {
              const approvalId = Date.now().toString();

              // Store the resolver for this approval
              agentService.addPendingApproval(approvalId, { resolve, reject });

              // Send confirmation request to Sidebar
              agentService.broadcastMessage({
                type: 'wallet_confirmation',
                approvalId,
                data: confirmationData,
              });

              // Set timeout for approval
              setTimeout(() => {
                if (agentService.hasPendingApproval(approvalId)) {
                  agentService.removePendingApproval(approvalId);
                  reject(new Error('Confirmation timeout'));
                }
              }, 60000); // 60 second timeout
            });
          }

          permissionService.touchConnectedSite(origin);
        } else {
          // Fallback to popup for other types
          ctx.approvalRes = await notificationService.requestApproval(
            {
              approvalComponent: approvalType,
              params: {
                $ctx: ctx?.request?.data?.$ctx,
                method,
                data: ctx.request.data.params,
                session: { origin, name, icon },
              },
              account: ctx.request.account,
              origin,
            },
            { height: windowHeight }
          );
        }
      } else {
        ctx.approvalRes = await notificationService.requestApproval(
          {
            approvalComponent: approvalType,
            params: {
              $ctx: ctx?.request?.data?.$ctx,
              method,
              data: ctx.request.data.params,
              session: { origin, name, icon },
            },
            account: ctx.request.account,
            origin,
          },
          { height: windowHeight }
        );
      }

      if (isSignApproval(approvalType)) {
        permissionService.updateConnectSite(origin, { isSigned: true }, true);
      } else {
        permissionService.touchConnectedSite(origin);
      }
    }

    return next();
  })
  .use(async (ctx) => {
    const { approvalRes, mapMethod, request } = ctx;
    // process request
    const [approvalType] =
      Reflect.getMetadata('APPROVAL', providerController, mapMethod) || [];
    const { uiRequestComponent, ...rest } = approvalRes || {};
    const {
      session: { origin },
    } = request;

    const createRequestDeferFn = (
      originApprovalRes: typeof approvalRes
    ) => async (isRetry = false) =>
      new Promise((resolve, reject) => {
        let waitSignComponentPromise = Promise.resolve();
        if (isSignApproval(approvalType) && uiRequestComponent) {
          waitSignComponentPromise = waitSignComponentAmounted();
        }

        // if (approvalRes?.isGnosis && !approvalRes.safeMessage) {
        //   return resolve(undefined);
        // }
        if (originApprovalRes?.isGnosis) {
          return resolve(undefined);
        }

        return waitSignComponentPromise.then(() => {
          let _approvalRes = originApprovalRes;

          if (
            isRetry &&
            approvalType === 'SignTx' &&
            mapMethod === 'ethSendTransaction'
          ) {
            _approvalRes = { ...originApprovalRes };
            const {
              getRetryTxType,
              getRetryTxRecommendNonce,
            } = bgRetryTxMethods;
            const retryType = getRetryTxType();
            switch (retryType) {
              case 'nonce': {
                const recommendNonce = getRetryTxRecommendNonce();
                if (recommendNonce === _approvalRes.nonce) {
                  _approvalRes.nonce = intToHex(
                    hexToNumber(recommendNonce as '0x${string}') + 1
                  );
                } else {
                  _approvalRes.nonce = recommendNonce;
                }

                break;
              }

              case 'gasPrice': {
                if (_approvalRes.gasPrice) {
                  _approvalRes.gasPrice = `0x${new BigNumber(
                    new BigNumber(_approvalRes.gasPrice, 16)
                      .times(1.3)
                      .toFixed(0)
                  ).toString(16)}`;
                }
                if (_approvalRes.maxFeePerGas) {
                  _approvalRes.maxFeePerGas = `0x${new BigNumber(
                    new BigNumber(_approvalRes.maxFeePerGas, 16)
                      .times(1.3)
                      .toFixed(0)
                  ).toString(16)}`;
                }
                break;
              }

              default:
                break;
            }
            if (retryType) {
              if (!approvalRes?.isGnosis) {
                notificationService.setCurrentRequestDeferFn(
                  createRequestDeferFn(_approvalRes)
                );
              }
            }
          }

          return Promise.resolve(
            providerController[mapMethod]({
              ...request,
              approvalRes: _approvalRes,
            })
          )
            .then((result) => {
              if (isSignApproval(approvalType)) {
                eventBus.emit(EVENTS.broadcastToUI, {
                  method: EVENTS.SIGN_FINISHED,
                  params: {
                    success: true,
                    data: result,
                  },
                });
              }
              // After successful processing, notify Agent sidebar about network changes or additions
              try {
                if (mapMethod === 'walletSwitchEthereumChain' || mapMethod === 'walletAddEthereumChain') {
                  const { session: { origin }, data: { params } } = request as any;
                  let cid: any = params?.[0]?.chainId;
                  let idNum: number | null = null;
                  if (typeof cid === 'number') idNum = cid; else if (typeof cid === 'string') idNum = cid.startsWith('0x') ? parseInt(cid, 16) : parseInt(cid, 10);
                  const chainObj = idNum ? findChain({ id: idNum }) : null;
                  if (chainObj) {
                    agentService.broadcastMessage({
                      type: 'execution',
                      actor: 'SYSTEM',
                      state: 'TASK_OK',
                      timestamp: Date.now(),
                      data: {
                        details: (ctx as any)._autoNetworkAdded
                          ? `Added custom network and switched: ${(chainObj as any).name} (chainId ${idNum})`
                          : `Switched network: ${(chainObj as any).name} (chainId ${idNum})`,
                      },
                    });
                  }
                }
              } catch {}
              return result;
            })
            .then(resolve)
            .catch((e: any) => {
              console.error(e);
              const payload = {
                method: EVENTS.SIGN_FINISHED,
                params: {
                  success: false,
                  errorMsg: e?.message || JSON.stringify(e),
                },
              };
              if (e.method) {
                payload.method = e.method;
                payload.params = e.message;
              }

              if (isSignApproval(approvalType)) {
                eventBus.emit(EVENTS.broadcastToUI, payload);
              }
              reject(e);
            });
        });
      });

    const requestDeferFn = createRequestDeferFn(approvalRes);

    if (!approvalRes?.isGnosis) {
      notificationService.setCurrentRequestDeferFn(requestDeferFn);
    }
    const requestDefer = requestDeferFn();
    async function requestApprovalLoop({
      uiRequestComponent,
      $account,
      ...rest
    }) {
      ctx.request.requestedApproval = true;
      const res = await notificationService.requestApproval({
        approvalComponent: uiRequestComponent,
        params: rest,
        account: $account,
        origin,
        approvalType,
        isUnshift: true,
      });
      if (res?.uiRequestComponent) {
        return await requestApprovalLoop(res);
      } else {
        return res;
      }
    }

    if (uiRequestComponent) {
      ctx.request.requestedApproval = true;
      const result = await requestApprovalLoop({ uiRequestComponent, ...rest });
      reportStatsData();
      if (rest?.safeMessage) {
        const safeMessage: {
          safeAddress: string;
          message: string | Record<string, any>;
          chainId: number;
          safeMessageHash: string;
        } = rest.safeMessage;
        if (ctx.request.requestedApproval) {
          flow.requestedApproval = false;
          // only unlock notification if current flow is an approval flow
          notificationService.unLock();
        }
        return gnosisController.watchMessage({
          address: safeMessage.safeAddress,
          chainId: safeMessage.chainId,
          safeMessageHash: safeMessage.safeMessageHash,
        });
      } else {
        return result;
      }
    }

    return requestDefer;
  })
  .callback();

function reportStatsData() {
  const statsData = notificationService.getStatsData();

  if (!statsData || statsData.reported) return;

  if (statsData?.signed) {
    const sData: any = {
      type: statsData?.type,
      chainId: statsData?.chainId,
      category: statsData?.category,
      success: statsData?.signedSuccess,
      preExecSuccess: statsData?.preExecSuccess,
      createdBy: statsData?.createdBy,
      source: statsData?.source,
      trigger: statsData?.trigger,
      networkType: statsData?.networkType,
    };
    if (statsData.signMethod) {
      sData.signMethod = statsData.signMethod;
    }
    stats.report('signedTransaction', sData);
  }
  if (statsData?.submit) {
    stats.report('submitTransaction', {
      type: statsData?.type,
      chainId: statsData?.chainId,
      category: statsData?.category,
      success: statsData?.submitSuccess,
      preExecSuccess: statsData?.preExecSuccess,
      createdBy: statsData?.createdBy,
      source: statsData?.source,
      trigger: statsData?.trigger,
      networkType: statsData?.networkType || '',
    });
  }

  statsData.reported = true;

  notificationService.setStatsData(statsData);
}

export default (request: ProviderRequest) => {
  const ctx: any = {
    request: { ...request, requestedApproval: false },
  };
  notificationService.setStatsData();
  return flowContext(ctx).finally(() => {
    reportStatsData();

    if (ctx.request.requestedApproval) {
      flow.requestedApproval = false;
      // only unlock notification if current flow is an approval flow
      notificationService.unLock();
    }
  });
};
