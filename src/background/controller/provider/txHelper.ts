import { walletController } from '@/background/controller';
import { findChain } from '@/utils/chain';
import { Account } from '@/background/service/preference';
import type { Tx, ExplainTxResponse } from '@/background/service/openapi';

export interface TxApprovalResult {
  approvalRes: Tx & { signingTxId?: undefined };
  preExecResult: ExplainTxResponse;
  estimatedGas: string;
}

export interface BuildTxApprovalParams {
  txParams: Partial<Tx> & {
    to: string;
    from: string;
    chainId?: number;
  };
  account: Account | null | undefined;
  origin: string;
}

/**
 * Build transaction approval result with pre-execution and gas recommendation
 * This helper consolidates the common logic for transaction processing
 */
export async function buildTxApprovalResWithPreExec(
  params: BuildTxApprovalParams
): Promise<TxApprovalResult> {
  const { txParams, account, origin } = params;

  if (!account?.address) {
    throw new Error('Account address is required for transaction processing');
  }

  const chain = findChain({ id: txParams.chainId });
  if (!chain) {
    throw new Error(`Unsupported chain ID: ${txParams.chainId}`);
  }

  // Get recommended nonce (hex string)
  const recommendNonce = await walletController.getRecommendNonce({
    from: txParams.from,
    chainId: chain.id,
  });

  // Build tx object with required fields populated explicitly to satisfy Tx typing
  const txForExec: Tx = {
    chainId: chain.id,
    to: txParams.to,
    from: txParams.from,
    data: txParams.data || '0x',
    value: txParams.value || '0x0',
    gas: txParams.gas || '0x0',
    gasPrice: txParams.gasPrice || '0x0',
    maxFeePerGas: txParams.maxFeePerGas,
    maxPriorityFeePerGas: txParams.maxPriorityFeePerGas,
    nonce: recommendNonce,
  } as Tx;

  // Execute pre-execution to validate transaction and estimate gas
  const preExecResult = await walletController.openapi.preExecTx({
    tx: txForExec,
    origin: origin || '',
    address: account.address,
    updateNonce: true,
    pending_tx_list: [],
    delegate_call: false,
  });

  // Calculate estimated gas
  let estimateGas = 0;
  if (preExecResult.gas?.success) {
    estimateGas = preExecResult.gas.gas_limit || preExecResult.gas.gas_used;
  }

  // Get recommended gas settings
  const { gas: gasRaw } = await walletController.getRecommendGas({
    gasUsed: preExecResult.gas?.gas_used || estimateGas,
    gas: estimateGas,
    tx: txForExec,
    chainId: chain.id,
  } as any);

  const gasLimit = `0x${gasRaw.integerValue().toString(16)}`;

  // Build final approval result (overwrite gas with recommended limit)
  const approvalRes: Tx & { signingTxId?: undefined } = {
    ...txForExec,
    gas: gasLimit,
    signingTxId: undefined,
  };

  return {
    approvalRes,
    preExecResult,
    estimatedGas: gasLimit,
  };
}
