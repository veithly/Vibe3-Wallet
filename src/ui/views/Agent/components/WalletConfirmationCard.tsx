import React, { useState } from 'react';
import { Button, Card, Typography, Divider, Space, Checkbox } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, InfoCircleOutlined, StarOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

interface WalletConfirmationCardProps {
  data: {
    txParams: {
      to: string;
      value?: string;
      data?: string;
      gas: string;
      gasPrice?: string;
      maxFeePerGas?: string;
      maxPriorityFeePerGas?: string;
      nonce: string;
    };
    preExecResult: {
      pre_exec: {
        success: boolean;
        error?: string;
      };
      gas: {
        success: boolean;
        gas_used: number;
        gas_limit: number;
      };
    };
    chain: {
      name: string;
      id: number;
      nativeTokenSymbol: string;
    };
    account: {
      address: string;
      brandName?: string;
    };
    origin: string;
    estimatedGas: string;
  };
  onConfirm: (addToWhitelist?: boolean) => void;
  onReject: () => void;
}

const WalletConfirmationCard: React.FC<WalletConfirmationCardProps> = ({
  data,
  onConfirm,
  onReject,
}) => {
  const { txParams, preExecResult, chain, account, origin } = data;
  const [addToWhitelist, setAddToWhitelist] = useState(false);

  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatValue = (value?: string) => {
    if (!value || value === '0x0' || value === '0') return '0';
    try {
      const wei = BigInt(value);
      const eth = Number(wei) / 1e18;
      return eth.toFixed(6);
    } catch {
      return value;
    }
  };

  const formatGas = (gas: string) => {
    try {
      return parseInt(gas, 16).toLocaleString();
    } catch {
      return gas;
    }
  };

  const isContractCall = txParams.data && txParams.data !== '0x';
  const hasError = !preExecResult.pre_exec.success;

  return (
    <Card
      style={{
        margin: '16px 0',
        borderRadius: '12px',
        border: hasError ? '1px solid #ff4d4f' : '1px solid #d9d9d9',
      }}
      bodyStyle={{ padding: '20px' }}
    >
      <div style={{ marginBottom: '16px' }}>
        <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <InfoCircleOutlined style={{ color: '#1890ff' }} />
          Transaction Confirmation
        </Title>
        <Text type="secondary" style={{ fontSize: '12px' }}>
          From: {origin}
        </Text>
      </div>

      <Divider style={{ margin: '12px 0' }} />

      <Space direction="vertical" style={{ width: '100%' }} size="small">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text strong>To:</Text>
          <Text code>{formatAddress(txParams.to)}</Text>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text strong>Value:</Text>
          <Text>{formatValue(txParams.value)} {chain.nativeTokenSymbol}</Text>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text strong>Gas Limit:</Text>
          <Text>{formatGas(txParams.gas)}</Text>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text strong>Network:</Text>
          <Text>{chain.name}</Text>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Text strong>Account:</Text>
          <Text code>{formatAddress(account.address)}</Text>
        </div>

        {isContractCall && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Text strong>Type:</Text>
            <Text>Contract Interaction</Text>
          </div>
        )}
      </Space>

      {hasError && (
        <div
          style={{
            marginTop: '12px',
            padding: '8px 12px',
            backgroundColor: '#fff2f0',
            border: '1px solid #ffccc7',
            borderRadius: '6px',
          }}
        >
          <Text type="danger" style={{ fontSize: '12px' }}>
            ⚠️ Transaction simulation failed: {preExecResult.pre_exec.error || 'Unknown error'}
          </Text>
        </div>
      )}

      {isContractCall && (
        <div style={{ marginTop: '12px' }}>
          <Checkbox
            checked={addToWhitelist}
            onChange={(e) => setAddToWhitelist(e.target.checked)}
          >
            <Space>
              <StarOutlined style={{ color: '#faad14' }} />
              <Text style={{ fontSize: '13px' }}>
                Add this contract to whitelist for future auto-approval
              </Text>
            </Space>
          </Checkbox>
        </div>
      )}

      <Divider style={{ margin: '16px 0 12px 0' }} />

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <Button
          icon={<CloseCircleOutlined />}
          onClick={onReject}
          style={{ minWidth: '100px' }}
        >
          Reject
        </Button>
        <Button
          type="primary"
          icon={<CheckCircleOutlined />}
          onClick={() => onConfirm(addToWhitelist)}
          disabled={hasError}
          style={{ minWidth: '100px' }}
        >
          Confirm
        </Button>
      </div>
    </Card>
  );
};

export default WalletConfirmationCard;
