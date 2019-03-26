import { useCallback, useRef, useState } from 'react';

export function useThunkReducer<S, A>(reducer: (s: S, a: A) => S, initialState: S): [S, (a: A) => void] {
  const [hookState, setHookState] = useState(initialState);

  const state = useRef(hookState);
  const getState = () => state.current;
  const setState = (newState: S) => {
    state.current = newState;
    setHookState(newState);
  };

  const reduce = (action: A) => reducer(getState(), action);
  const dispatch = (action: A) => (
    typeof action === 'function'
      ? action(dispatch, getState)
      : setState(reduce(action))
  );

  return [hookState, dispatch];
}
