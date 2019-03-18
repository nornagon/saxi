import { useState } from "react";

// redux-thunk
function createThunkMiddleware<S, A>(extraArgument?: any) {
  return ({ dispatch, getState }: {
    dispatch: (a: A) => void,
    getState: () => S
  }) => (next: (a: A) => void) => (action: A) => {
    if (typeof action === "function") {
      return action(dispatch, getState, extraArgument);
    }

    return next(action);
  };
}
const thunk = createThunkMiddleware();

// https://github.com/shiningjason/react-enhanced-reducer-hook
function compose(...fns: any): any {
  if (fns.length === 0) { return (arg: any) => arg; }
  if (fns.length === 1) { return fns[0]; }
  return fns.reduce((a: any, b: any) => (...args: any) => a(b(...args)));
}

function useEnhancedReducer<S, A>(
  reducer: (s: S, a: A) => S,
  initialState: S,
  middlewares = [] as any
): [S, (a: A) => void] {
  const hook = useState(initialState);
  let state = hook[0];
  const setState = hook[1];
  const dispatch = (action: A) => {
    state = reducer(state, action);
    setState(state);
    return action;
  };
  let enhancedDispatch: any;
  const store = {
    getState: () => state,
    dispatch: (...args: any) => enhancedDispatch(...args)
  };
  const chain = middlewares.map((middleware: any) => middleware(store));
  enhancedDispatch = compose.apply(void 0, chain)(dispatch);
  return [state, enhancedDispatch];
}

export function useThunkReducer<S, A>(reducer: (s: S, a: A) => S, initialState: S) {
  return useEnhancedReducer(reducer, initialState, [thunk]);
}
