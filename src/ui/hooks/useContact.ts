import { useCallback } from 'react';
import { useVibe3Dispatch, useVibe3Selector } from '../store';
import { KEYRING_CLASS } from '@/constant';
import { isSameAddress } from '../utils';

export function useContactAccounts() {
  const dispatch = useVibe3Dispatch();
  const { accountsList, contactsByAddr } = useVibe3Selector((state) => {
    return {
      accountsList: state.accountToDisplay.accountsList,
      contactsByAddr: state.contactBook.contactsByAddr,
    };
  });

  const isAddrOnContactBook = useCallback(
    (address?: string) => {
      if (!address) return false;
      const laddr = address.toLowerCase();

      return (
        !!contactsByAddr[laddr]?.isAlias &&
        accountsList.find((account) => isSameAddress(account.address, laddr))
      );
    },
    [accountsList, contactsByAddr]
  );

  const getAddressNote = useCallback(
    (addr) => {
      return contactsByAddr[addr.toLowerCase()]?.name || '';
    },
    [contactsByAddr]
  );

  const fetchContactAccounts = useCallback(() => {
    dispatch.contactBook.getContactBookAsync();
    dispatch.accountToDisplay.getAllAccountsToDisplay();
  }, []);

  return {
    getAddressNote,
    isAddrOnContactBook,
    fetchContactAccounts,
  };
}
