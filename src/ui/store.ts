import { init } from '@rematch/core';
import { models, RootModel, Vibe3Dispatch, Vibe3RootState } from './models';
import {
  connect,
  useDispatch,
  useSelector,
  TypedUseSelectorHook,
} from 'react-redux';
import selectPlugin from '@rematch/select';

import onStoreInitialized from './models/_uistore';

const store = init<RootModel>({ models, plugins: [selectPlugin()] });

onStoreInitialized(store);

export type { Vibe3RootState };

export { connect as connectStore };

export const useVibe3Dispatch = () => useDispatch<Vibe3Dispatch>();
export const useVibe3Selector: TypedUseSelectorHook<Vibe3RootState> = useSelector;

export function useVibe3Getter<Selected = unknown>(
  selector: (
    select: typeof store['select']
  ) => (state: Vibe3RootState) => Selected
) {
  return useSelector(selector(store.select));
}

export default store;
