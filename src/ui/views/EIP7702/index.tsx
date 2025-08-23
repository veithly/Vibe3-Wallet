import React, { useState, useEffect } from 'react';
import { useHistory } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Input, Form, message } from 'antd';
import { PageHeader } from '@/ui/component';
import { useWallet } from '@/ui/utils';
import { useVibe3Selector } from '@/ui/store';
import './style.less';

const EIP7702 = () => {
  const { t } = useTranslation();
  const history = useHistory();
  const wallet = useWallet();
  const [form] = Form.useForm();
  const [isLoading, setIsLoading] = useState(false);
  
  const currentAccount = useVibe3Selector((s) => s.account.currentAccount);

  const handleBack = () => {
    history.goBack();
  };

  const handleSubmit = async (values: any) => {
    setIsLoading(true);
    try {
      // TODO: 实现 EIP-7702 相关逻辑
      console.log('EIP-7702 Submit:', values);
      message.success('EIP-7702 操作成功');
    } catch (error) {
      console.error('EIP-7702 Error:', error);
      message.error('操作失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="eip-7702-container">
      <PageHeader onBack={handleBack}>
        EIP-7702
      </PageHeader>
      
      <div className="eip-7702-content">
        <div className="section-header">
          <h2>账户抽象 (EIP-7702)</h2>
          <p className="description">
            EIP-7702 允许 EOA 账户临时委托其权限给智能合约，实现账户抽象功能。
          </p>
        </div>

        <div className="current-account-info">
          <div className="info-item">
            <span className="label">当前账户：</span>
            <span className="value">{currentAccount?.address || '-'}</span>
          </div>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          className="eip-7702-form"
        >
          <Form.Item
            label="授权合约地址"
            name="contractAddress"
            rules={[
              { required: true, message: '请输入合约地址' },
              { 
                pattern: /^0x[a-fA-F0-9]{40}$/, 
                message: '请输入有效的以太坊地址' 
              }
            ]}
          >
            <Input 
              placeholder="0x..." 
              size="large"
              className="input-field"
            />
          </Form.Item>

          <Form.Item
            label="授权期限（区块数）"
            name="duration"
            rules={[
              { required: true, message: '请输入授权期限' },
              { 
                pattern: /^\d+$/, 
                message: '请输入有效的数字' 
              }
            ]}
          >
            <Input 
              placeholder="例如：100" 
              size="large"
              className="input-field"
            />
          </Form.Item>

          <Form.Item
            label="备注（可选）"
            name="memo"
          >
            <Input.TextArea 
              placeholder="添加备注信息..." 
              rows={3}
              className="input-field"
            />
          </Form.Item>

          <div className="button-group">
            <Button
              type="primary"
              htmlType="submit"
              size="large"
              loading={isLoading}
              block
            >
              授权
            </Button>
          </div>
        </Form>

        <div className="warning-box">
          <strong>⚠️ 注意事项：</strong>
          <ul>
            <li>请确保您了解 EIP-7702 的工作原理</li>
            <li>仅授权给您信任的合约地址</li>
            <li>授权会在指定的区块数后自动失效</li>
            <li>您可以随时撤销授权</li>
          </ul>
        </div>

        <div className="authorized-contracts">
          <h3>已授权合约</h3>
          <div className="contracts-list">
            <div className="empty-state">
              暂无已授权的合约
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EIP7702;