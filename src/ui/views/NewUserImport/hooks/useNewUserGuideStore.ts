import { Vibe3RootState, useVibe3Dispatch, useVibe3Getter } from '@/ui/store';
import { useMemoizedFn } from 'ahooks';
import { useSelector } from 'react-redux';

export const useNewUserGuideStore = () => {
  const store = useSelector((s: Vibe3RootState) => s.newUserGuide);

  const dispatch = useVibe3Dispatch();

  const clearStore = useMemoizedFn(() => {
    dispatch.newUserGuide.setState(
      Object.keys(store).reduce((res, key) => {
        res[key] = undefined;
        return res;
      }, {})
    );
  });

  return {
    store,
    setStore: dispatch.newUserGuide.setState,
    clearStore,
  };
};
