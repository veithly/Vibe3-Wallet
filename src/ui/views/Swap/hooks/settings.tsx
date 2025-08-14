import { useVibe3Dispatch, useVibe3Selector } from '@/ui/store';
import { useMemo } from 'react';

export const useSwapSettings = () => {
  const prevChain = useVibe3Selector((s) => s.swap.selectedChain);
  const dispatch = useVibe3Dispatch();

  const methods = useMemo(() => {
    const { setSelectedChain } = dispatch.swap;
    return {
      setSelectedChain,
    };
  }, [dispatch]);

  return {
    prevChain,
    dispatch,
    ...methods,
  };
};
