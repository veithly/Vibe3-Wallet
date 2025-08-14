/**
 * @author richardo2016x
 * @email richardo2016x@gmail.com
 * @create date 2022-05-27 17:01:24
 * @modify date 2022-05-27 17:01:24
 *
 * @desc biz hooks based on store (see ./store.ts),
 *
 * @warning all hooks ONLY valid if the component connected
 * to the store by `connectStore` API in ./store.ts
 */
import { useEffect, useState } from 'react';
import { useVibe3Dispatch, useVibe3Getter, useVibe3Selector } from './store';

export function useAccount() {
  const account = useVibe3Selector((state) => state.account.currentAccount);
  const dispatch = useVibe3Dispatch();
  const setAccount = dispatch.account.setCurrentAccount;
  return [account, setAccount] as const;
}

/**
 * @description check if current wallet should display about tip mnemonic
 */
export function useIsShowMnemonic() {
  const dispatch = useVibe3Dispatch();
  const isShowMnemonic = useVibe3Getter<boolean>(
    (s) => s.account.isShowMnemonic
  );

  useEffect(() => {
    dispatch.account.getTypedMnemonicAccountsAsync();
  }, []);

  return isShowMnemonic;
}
