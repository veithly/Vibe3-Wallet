import React, { useMemo, forwardRef, HTMLAttributes, useEffect } from 'react';
import { CHAINS_ENUM, Chain } from '@debank/common';
import { Tooltip } from 'antd';
import clsx from 'clsx';
import { useVibe3Dispatch, useVibe3Selector } from '@/ui/store';
import ChainIcon from '../../ChainIcon';
import IconCheck from '@/ui/assets/check-2.svg';
import IconPinned, {
  ReactComponent as RcIconPinned,
} from '@/ui/assets/icon-pinned.svg';
import IconPinnedFill, {
  ReactComponent as RcIconPinnedFill,
} from '@/ui/assets/icon-pinned-fill.svg';
import IconChainBalance, {
  ReactComponent as RcIconChainBalance,
} from '@/ui/assets/chain-select/chain-balance.svg';
import { ReactComponent as RcIconWarningCC } from '@/ui/assets/riskWarning-cc.svg';
// Add edit and delete icons
import { ReactComponent as RcIconEdit } from '@/ui/assets/custom-rpc/edit.svg';
import { ReactComponent as RcIconDelete } from '@/ui/assets/custom-rpc/delete.svg';

import { formatUsdValue } from '@/ui/utils';
import ThemeIcon from '../../ThemeMode/ThemeIcon';
import { TestnetChainLogo } from '../../TestnetChainLogo';
import { useHistory } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { message } from 'antd';
import IconSuccess from '@/ui/assets/success.svg';
import { matomoRequestEvent } from '@/utils/matomo-request';
import { useWallet } from '@/ui/utils';
import { updateChainStore } from '@/utils/chain';

export type TDisableCheckChainFn = (
  chain: string
) => {
  disable: boolean;
  reason: string;
  shortReason: string;
};

export type SelectChainItemProps = {
  stared?: boolean;
  data: Chain;
  value?: CHAINS_ENUM;
  onStarChange?: (value: boolean) => void;
  onChange?: (value: CHAINS_ENUM) => void;
  disabled?: boolean;
  disabledTips?: string | ((ctx: { chain: Chain }) => string);
  showRPCStatus?: boolean;
  disableChainCheck?: TDisableCheckChainFn;
} & Omit<HTMLAttributes<HTMLDivElement>, 'onChange'>;

export const SelectChainItem = forwardRef(
  (
    {
      data,
      className,
      stared,
      value,
      onStarChange,
      onChange,
      disabled = false,
      disabledTips = 'Coming soon',
      showRPCStatus = false,
      disableChainCheck,
      ...rest
    }: SelectChainItemProps,
    ref: React.ForwardedRef<HTMLDivElement>
  ) => {
    const { customRPC, cachedChainBalances } = useVibe3Selector((s) => ({
      customRPC: s.customRPC.customRPC,
      cachedChainBalances: {
        mainnet: s.account.matteredChainBalances,
        testnet: s.account.testnetMatteredChainBalances,
      },
    }));
    const dispatch = useVibe3Dispatch();
    const history = useHistory();
    const { t } = useTranslation();
    const wallet = useWallet();

    useEffect(() => {
      dispatch.customRPC.getAllRPC();
    }, []);

    const finalDisabledTips = useMemo(() => {
      if (typeof disabledTips === 'function') {
        return disabledTips({ chain: data });
      }

      return disabledTips;
    }, [disabledTips]);

    const chainBalanceItem = useMemo(() => {
      return (
        cachedChainBalances.mainnet?.[data.serverId] ||
        cachedChainBalances.testnet?.[data.serverId]
      );
    }, [cachedChainBalances]);

    const { disable: disableFromToAddress, shortReason } = useMemo(() => {
      return (
        disableChainCheck?.(data.serverId) || {
          disable: false,
          reason: '',
          shortReason: '',
        }
      );
    }, [data.serverId, disableChainCheck]);

    // Check if this is a custom network (custom testnet or custom RPC)
    const isCustomNetwork = useMemo(() => {
      // Custom testnet networks have enum starting with 'CUSTOM_'
      if (data.enum.startsWith('CUSTOM_')) {
        return true;
      }
      // Custom RPC networks exist in the customRPC store
      if (customRPC[data.enum]) {
        return true;
      }
      return false;
    }, [data.enum, customRPC]);

    const handleEdit = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (data.enum.startsWith('CUSTOM_')) {
        // Navigate to custom testnet page for editing
        history.push('/custom-testnet', {
          chainId: data.id
        });
      } else if (customRPC[data.enum]) {
        // Navigate to custom RPC page for editing
        history.push('/custom-rpc', {
          chainId: data.id,
          rpcUrl: customRPC[data.enum].url
        });
      }
    };

    const handleDelete = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (data.enum.startsWith('CUSTOM_')) {
        // Delete custom testnet
        try {
          await wallet.removeCustomTestnet(data.id);
          // Update the chain store after deletion
          const list = await wallet.getCustomTestnetList();
          updateChainStore({
            testnetList: list,
          });
          message.success({
            duration: 0.5,
            icon: <i />,
            content: (
              <div>
                <div className="flex gap-4 mb-4">
                  <img src={IconSuccess} alt="" />
                  {t('global.Deleted')}
                </div>
              </div>
            ),
          });
          matomoRequestEvent({
            category: 'Custom Network',
            action: 'delete',
            label: data.enum,
          });
        } catch (error) {
          console.error('Failed to delete custom testnet:', error);
        }
      } else if (customRPC[data.enum]) {
        // Delete custom RPC
        try {
          await dispatch.customRPC.deleteCustomRPC(data.enum);
          message.success({
            duration: 0.5,
            icon: <i />,
            content: (
              <div>
                <div className="flex gap-4 mb-4">
                  <img src={IconSuccess} alt="" />
                  {t('global.Deleted')}
                </div>
              </div>
            ),
          });
          matomoRequestEvent({
            category: 'CustomRPC',
            action: 'delete',
            label: data.enum,
          });
        } catch (error) {
          console.error('Failed to delete custom RPC:', error);
        }
      }
    };

    return (
      <Tooltip
        trigger={['click', 'hover']}
        mouseEnterDelay={3}
        overlayClassName={clsx('rectangle')}
        placement="top"
        title={finalDisabledTips}
        visible={disabled ? undefined : false}
        align={{ targetOffset: [0, -30] }}
      >
        <div
          className={clsx(
            'select-chain-item group',
            disabled && 'opacity-50 select-chain-item-disabled cursor-default',
            {
              'opacity-80': disableFromToAddress,
            },
            className
          )}
          ref={ref}
          {...rest}
          onClick={() => !disabled && onChange?.(data.enum)}
        >
          <div className="w-full h-[60px] flex items-center">
            <div className="flex flex-1 items-center">
              {data.isTestnet ? (
                data.logo ? (
                  <img
                    src={data.logo}
                    alt=""
                    className="select-chain-item-icon"
                  />
                ) : (
                  <TestnetChainLogo
                    name={data.name}
                    className="select-chain-item-icon"
                  />
                )
              ) : (
                <>
                  {showRPCStatus ? (
                    <ChainIcon
                      chain={data.enum}
                      customRPC={
                        customRPC[data.enum]?.enable
                          ? customRPC[data.enum].url
                          : ''
                      }
                      showCustomRPCToolTip
                    />
                  ) : (
                    <img
                      src={data.logo}
                      alt={`${data.name} chain icon`}
                      className="select-chain-item-icon"
                    />
                  )}
                </>
              )}
              <div className="select-chain-item-info">
                <div className="select-chain-item-name">{data.name}</div>
                {!!chainBalanceItem?.usd_value && (
                  <div className="select-chain-item-balance">
                    <ThemeIcon
                      className="w-[14px] h-[14px] mt-2"
                      src={RcIconChainBalance}
                      // alt={formatUsdValue(chainBalanceItem?.usd_value || 0)}
                    />
                    <div className="ml-[6px] relative top-[2px]">
                      {formatUsdValue(chainBalanceItem?.usd_value || 0)}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Edit and Delete buttons for custom networks */}
            {isCustomNetwork && (
              <div className="flex items-center gap-[8px] mr-[8px] opacity-0 group-hover:opacity-100 transition-opacity">
                <div
                  className="cursor-pointer hover:opacity-80"
                  onClick={handleEdit}
                  aria-label={t('global.Edit')}
                >
                  <ThemeIcon
                    src={RcIconEdit}
                    className="w-[16px] h-[16px]"
                  />
                </div>
                <div
                  className="cursor-pointer hover:opacity-80 text-r-red-default"
                  onClick={handleDelete}
                  aria-label={t('global.Delete')}
                >
                  <ThemeIcon
                    src={RcIconDelete}
                    className="w-[16px] h-[16px]"
                  />
                </div>
              </div>
            )}

            <ThemeIcon
              className={clsx(
                'w-16 h-16 select-chain-item-star',
                stared ? 'is-active' : ''
              )}
              src={stared ? RcIconPinnedFill : RcIconPinned}
              onClick={(e) => {
                e.stopPropagation();
                onStarChange?.(!stared);
              }}
            />
            {value === data.enum ? (
              <img className="select-chain-item-checked" src={IconCheck} alt="Selected" />
            ) : null}
          </div>
          {!!shortReason && (
            <div
              className={`flex gap-2 justify-center items-center mb-14 w-full rounded-[4px] bg-r-red-light h-[31px] mt-[-2px]`}
            >
              <div className="text-r-red-default">
                <RcIconWarningCC />
              </div>
              <span className="text-[13px] font-medium text-r-red-default">
                {shortReason}
              </span>
            </div>
          )}
        </div>
      </Tooltip>
    );
  }
);
